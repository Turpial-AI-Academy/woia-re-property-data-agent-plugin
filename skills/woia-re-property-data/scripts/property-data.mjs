import { createHash } from 'node:crypto';

export const actions = Object.freeze(['property.search','property.read','property.create','property.update','property.unit.link','mandate.create','mandate.version','mandate.activate','mandate.revoke','listing.create','listing.version','listing.withdraw','listing.reactivate']);
const writer = 'woia-re-property-data';
const assert = (ok, code) => { if (!ok) throw new Error(code); };
const text = (v) => typeof v === 'string' && v.trim().length > 0;
const stable = (v) => JSON.stringify(v, (_, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))) : value);
export const digest = (v) => createHash('sha256').update(stable(v)).digest('hex');
export function emptyState(org_id) {
  assert(text(org_id),'ORG_REQUIRED');
  return { org_id, revision:0, properties:[], containment:[], mandates:[], listings:[], operations:[] };
}
function current(record) { const version=record.versions.at(-1); return {...version,status:record.transitions?.filter(t=>t.version_no===version.version_no).at(-1)?.to??version.status}; }
function effective(version, now) { return Number.isFinite(Date.parse(version.effective_from)) && Number.isFinite(Date.parse(version.effective_until)) && Date.parse(version.effective_from)<=now && now<Date.parse(version.effective_until); }
function access(state, command, context) {
  assert(state.org_id === command.org_id && context.org_id === command.org_id,'ORG_SCOPE');
  assert(actions.includes(command.action),'ACTION_UNSUPPORTED');
  assert(text(context.actor_ref) && text(context.purpose),'AUTHENTICATION_REQUIRED');
  const grant = context.grant;
  assert(grant && grant.actor_ref === context.actor_ref && grant.org_id === command.org_id && grant.purpose === context.purpose && grant.actions?.includes(command.action) && grant.targets?.includes(command.target_id) && text(grant.policy_ref) && text(grant.revision) && grant.revoked === false && Number.isFinite(context.now) && grant.valid_from <= context.now && context.now < grant.valid_until,'AUTHORITY_DENIED');
  assert(command.fields?.length && command.fields.every(f => grant.fields?.includes(f)),'FIELD_SCOPE');
}
function source(command, context, family) {
  const map = context.source_map;
  const rule = map?.entries?.find(r => r.family === family && r.target_id === command.target_id);
  assert(map?.org_id === command.org_id && text(map.version) && text(map.digest) && map.current === true && rule?.writer === writer && rule.conflict === false && Number.isFinite(rule.observed_at) && Number.isFinite(rule.max_age) && rule.max_age >= 0 && context.now >= rule.observed_at && context.now - rule.observed_at <= rule.max_age,'SOURCE_AUTHORITY_BLOCKED');
  assert(text(command.evidence_ref) && text(command.source_ref) && rule.source_ref === command.source_ref,'SOURCE_EVIDENCE_REQUIRED');
}
function competent(command, context, kind, version) {
  const proof = context.acceptance;
  assert(proof && proof.org_id === command.org_id && proof.target_id === command.target_id && proof.version_no === version && proof.kind === kind && text(proof.actor_ref) && text(proof.evidence_ref) && proof.payload_digest === digest(command.data) && proof.source_map_version === context.source_map.version && text(proof.authority_ref) && proof.revoked === false && proof.valid_from <= context.now && context.now < proof.valid_until,'COMPETENT_ACCEPTANCE_REQUIRED');
}
function propertiesExist(state, rows) {
  assert(Array.isArray(rows) && rows.length > 0,'PROPERTY_SCOPE_REQUIRED');
  assert(rows.every(r=>text(r.property_id) && text(r.scope_role) && state.properties.some(p=>p.property_id===r.property_id)),'PROPERTY_REFERENCE');
  assert(new Set(rows.map(r=>stable(r))).size===rows.length,'DUPLICATE_SCOPE');
}
function project(record, fields) { return Object.fromEntries(fields.filter(f=>Object.hasOwn(record,f)).map(f=>[f,structuredClone(record[f])])); }

/** Pure reference reducer. A qualified store must atomically enforce revision, operation uniqueness and result persistence. Context must be resolved by the trusted host, never by an agent's assertion. */
export function execute(state, command, context) {
  access(state,command,context);
  const read = ['property.search','property.read'].includes(command.action);
  if (read) {
    const visible = state.properties.filter(p=>context.grant.targets.includes(p.property_id));
    const rows = command.action === 'property.read' ? visible.filter(p=>p.property_id===command.target_id) : visible.filter(p=>!command.query || p.property_id.includes(command.query));
    return { state, result: rows.map(p=>project(p,command.fields)) };
  }
  const family = command.action.split('.')[0] === 'property' ? 'Property' : command.action.startsWith('mandate.') ? 'Mandate' : 'Listing';
  source(command,context,family);
  assert(text(command.operation_key),'OPERATION_KEY_REQUIRED');
  const fingerprint = digest(command);
  const prior = state.operations.find(o=>o.key===command.operation_key);
  if (prior) { assert(prior.digest===fingerprint,'OPERATION_KEY_COLLISION'); return { state, result:structuredClone(prior.result) }; }
  assert(command.expected_revision === state.revision,'REVISION_CONFLICT');
  assert(command.data && typeof command.data === 'object' && !Array.isArray(command.data),'DATA_REQUIRED');
  assert(Object.keys(command.data).every(k=>command.fields.includes(k)),'FIELD_SCOPE');
  const next = structuredClone(state), data = structuredClone(command.data);
  let result;
  if (command.action === 'property.create') {
    assert(!next.properties.some(p=>p.property_id===command.target_id),'PROPERTY_EXISTS');
    assert(text(data.kind) && Object.keys(data).every(k=>['kind','attributes'].includes(k)),'PROPERTY_FIELDS');
    result = {org_id:state.org_id,property_id:command.target_id,...data,revision:1,history:[{...data,revision:1,evidence_ref:command.evidence_ref,source_ref:command.source_ref}]};
    next.properties.push(result);
  } else if (command.action === 'property.update') {
    const record = next.properties.find(p=>p.property_id===command.target_id);
    assert(record,'PROPERTY_NOT_FOUND');
    assert(Object.keys(data).every(k=>['kind','attributes'].includes(k)) && (!Object.hasOwn(data,'kind') || text(data.kind)),'PROPERTY_FIELDS');
    Object.assign(record,data); record.revision++;
    record.history.push({...data,revision:record.revision,evidence_ref:command.evidence_ref,source_ref:command.source_ref}); result=record;
  } else if (command.action === 'property.unit.link') {
    assert(data.parent_property_id===command.target_id && text(data.child_property_id) && text(data.effective_from),'CONTAINMENT_REQUIRED');
    assert(Object.keys(data).every(k=>['parent_property_id','child_property_id','effective_from','effective_until'].includes(k)),'CONTAINMENT_FIELDS');
    assert(data.parent_property_id!==data.child_property_id && [data.parent_property_id,data.child_property_id].every(id=>next.properties.some(p=>p.property_id===id)),'PROPERTY_REFERENCE');
    assert(context.grant.targets.includes(data.child_property_id),'CHILD_AUTHORITY_SCOPE');
    assert(!data.effective_until || data.effective_from < data.effective_until,'CONTAINMENT_INTERVAL');
    const reaches = (id,target,seen=new Set()) => id===target || (!seen.has(id) && (seen.add(id),next.containment.filter(r=>r.parent_property_id===id).some(r=>reaches(r.child_property_id,target,seen))));
    assert(!reaches(data.child_property_id,data.parent_property_id),'CONTAINMENT_CYCLE');
    assert(!next.containment.some(r=>r.parent_property_id===data.parent_property_id && r.child_property_id===data.child_property_id && r.effective_from===data.effective_from),'CONTAINMENT_EXISTS');
    result={org_id:state.org_id,...data,evidence_ref:command.evidence_ref}; next.containment.push(result);
  } else {
    const isMandate = family==='Mandate', list = isMandate ? next.mandates : next.listings;
    const idField = isMandate ? 'mandate_id' : 'listing_id';
    let record = list.find(r=>r[idField]===command.target_id);
    const op = command.action.split('.')[1];
    if (['create','version'].includes(op)) {
      assert(op==='create' ? !record : Boolean(record),'VERSION_TARGET');
      const version = record ? current(record).version_no+1 : 1;
      assert(data.version_no===version,'VERSION_SEQUENCE');
      propertiesExist(next,data.property_scope);
      assert(data.property_scope.every(p=>context.grant.references?.includes(p.property_id)),'PROPERTY_REFERENCE_SCOPE');
      const allowed = isMandate ? ['version_no','property_scope','participants','authority_scopes','terms','effective_from','effective_until'] : ['version_no','property_scope','terms','mandate_id','mandate_version_no','media_refs'];
      assert(Object.keys(data).every(k=>allowed.includes(k)),'VERSION_FIELDS');
      if (isMandate) {
        assert(Array.isArray(data.participants) && data.participants.every(p=>text(p.subject_id)&&text(p.participant_role)),'PARTICIPANT_SCOPE');
        assert(data.participants.every(p=>context.subject_refs?.some(r=>r.org_id===state.org_id&&r.subject_id===p.subject_id&&r.provider==='woia-identity'&&text(r.version_ref)&&r.resolved===true)),'IDENTITY_REFERENCE_UNRESOLVED');
        assert(Array.isArray(data.authority_scopes) && data.authority_scopes.every(s=>text(s.represented_subject_id)&&text(s.power_code)&&text(s.scope_code)&&data.property_scope.some(p=>p.property_id===s.property_id)&&data.participants.some(p=>p.subject_id===s.represented_subject_id)),'MANDATE_AUTHORITY_SCOPE');
        assert(text(data.effective_from) && text(data.effective_until) && data.effective_from<data.effective_until,'MANDATE_INTERVAL');
      } else {
        const mandate=next.mandates.find(m=>m.mandate_id===data.mandate_id);
        assert(context.grant.references?.includes(data.mandate_id),'MANDATE_REFERENCE_SCOPE');
        assert(mandate && current(mandate).version_no===data.mandate_version_no && current(mandate).status==='ACTIVE' && effective(current(mandate),context.now),'MANDATE_REQUIRED');
        assert(data.property_scope.every(p=>current(mandate).property_scope.some(m=>m.property_id===p.property_id)),'MANDATE_PROPERTY_SCOPE');
        competent(command,context,'ListingVersion',version);
      }
      if (!record) { record={org_id:state.org_id,[idField]:command.target_id,versions:[]}; list.push(record); }
      record.versions.push({...data,status:isMandate?'DRAFT':'APPROVED',evidence_ref:command.evidence_ref,source_ref:command.source_ref,source_map_version:context.source_map.version}); result=record;
    } else {
      assert(record,'TARGET_NOT_FOUND');
      const previous=current(record);
      assert(data.version_no===previous.version_no && Object.keys(data).every(k=>['version_no','reason'].includes(k)),'EXACT_VERSION_REQUIRED');
      const transitions={activate:['DRAFT','ACTIVE'],revoke:['ACTIVE','REVOKED'],withdraw:['APPROVED','WITHDRAWN'],reactivate:['WITHDRAWN','APPROVED']};
      const [from,to]=transitions[op]??[];
      assert(previous.status===from,'INVALID_TRANSITION');
      if (op==='activate') { assert(effective(previous,context.now),'MANDATE_NOT_EFFECTIVE'); competent(command,context,'MandateAuthority',previous.version_no); assert(context.acceptance.record_digest===digest(record.versions.at(-1)),'VERSION_ACCEPTANCE_MISMATCH'); }
      if (op==='reactivate') {
        const mandate=next.mandates.find(m=>m.mandate_id===previous.mandate_id);
        assert(mandate&&current(mandate).status==='ACTIVE'&&current(mandate).version_no===previous.mandate_version_no&&effective(current(mandate),context.now),'MANDATE_REQUIRED');
        competent(command,context,'ListingReactivation',previous.version_no);
        assert(context.acceptance.record_digest===digest(record.versions.at(-1)),'VERSION_ACCEPTANCE_MISMATCH');
      }
      // Preserve immutable version bytes; transitions are append-only history, current lifecycle is a projection.
      record.transitions??=[]; record.transitions.push({version_no:previous.version_no,from,to,evidence_ref:command.evidence_ref,operation_key:command.operation_key});
      result=record;
    }
  }
  next.revision++;
  result={action:command.action,target_id:command.target_id,revision:next.revision,fields:project(result,command.fields)};
  next.operations.push({key:command.operation_key,digest:fingerprint,result});
  return {state:next,result};
}
