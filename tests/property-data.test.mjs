import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,execute,digest,actions} from '../skills/woia-re-property-data/scripts/property-data.mjs';
import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
const now=Date.parse('2026-10-07T12:00:00Z');
function fixture(action='property.create',target_id='p1',data={kind:'unit'}) {
 const command={org_id:'org',action,target_id,data,fields:Object.keys(data),operation_key:'op-'+action+'-'+target_id,expected_revision:0,evidence_ref:'e1',source_ref:'s1'};
 const family=action.startsWith('property.')?'Property':action.startsWith('mandate.')?'Mandate':'Listing';
 const context={org_id:'org',actor_ref:'actor',purpose:'intake',now,grant:{org_id:'org',actor_ref:'actor',purpose:'intake',actions:[action],targets:[target_id],references:['p1','p2','m1','absent'],fields:[...Object.keys(data),'property_id','history'],policy_ref:'policy-v1',revision:'g1',revoked:false,valid_from:now-1,valid_until:now+100},source_map:{org_id:'org',version:'sm1',digest:'map-digest',current:true,entries:[{family,target_id,writer:'woia-re-property-data',conflict:false,observed_at:now,max_age:1000,source_ref:'s1'}]}};
 return {command,context};
}
function run(state,action,target,data,kind){const f=fixture(action,target,data);f.command.expected_revision=state.revision;f.context.subject_refs=[{org_id:'org',subject_id:'person1',provider:'woia-identity',version_ref:'id-v1',resolved:true}];if(action==='property.unit.link')f.context.grant.targets.push(data.child_property_id);if(kind)f.context.acceptance={org_id:'org',target_id:target,version_no:data.version_no,kind,actor_ref:'owner',evidence_ref:'accepted-e1',payload_digest:digest(data),source_map_version:'sm1',authority_ref:'competent-scope-v1',record_digest:digest((state.mandates.find(m=>m.mandate_id===target)??state.listings.find(l=>l.listing_id===target))?.versions.at(-1)??{}),revoked:false,valid_from:now-1,valid_until:now+100};return execute(state,f.command,f.context);}
function propertyState(){return run(emptyState('org'),'property.create','p1',{kind:'unit'}).state;}
function mandateState(){let s=propertyState();s=run(s,'mandate.create','m1',{version_no:1,property_scope:[{property_id:'p1',scope_role:'subject'}],participants:[{subject_id:'person1',participant_role:'represented'}],authority_scopes:[{property_id:'p1',represented_subject_id:'person1',power_code:'list',scope_code:'unit'}],terms:{source:'terms-v1'},effective_from:'2026-10-01T00:00:00Z',effective_until:'2026-11-01T00:00:00Z'}).state;return run(s,'mandate.activate','m1',{version_no:1},'MandateAuthority').state;}
test('actions contain all thirteen canonical operations',()=>assert.equal(actions.length,13));
test('command schema rejects unsupported operation and wrong shape',()=>{const schema=JSON.parse(readFileSync(new URL('../skills/woia-re-property-data/references/command.schema.json',import.meta.url)));const validate=new Ajv2020().compile(schema);assert.equal(validate(fixture().command),true);assert.equal(validate({...fixture().command,action:'rights.accept'}),false);assert.equal(validate({...fixture().command,unexpected:true}),false);});
test('property identity is separate from rights mandate and listing',()=>{const s=propertyState();assert.equal(s.properties.length,1);assert.equal(s.mandates.length,0);assert.equal(s.listings.length,0);});
test('input state is untouched',()=>{const s=emptyState('org'),f=fixture();execute(s,f.command,f.context);assert.equal(s.revision,0);});
test('exact duplicate returns original without new revision',()=>{const f=fixture(),r=execute(emptyState('org'),f.command,f.context);assert.deepEqual(execute(r.state,f.command,f.context),r);});
test('reused operation with changed payload is rejected',()=>{const f=fixture(),r=execute(emptyState('org'),f.command,f.context);f.command.data.kind='building';assert.throws(()=>execute(r.state,f.command,f.context),/COLLISION/);});
for(const [name,change,error] of [
 ['foreign organization',f=>f.context.org_id='other','ORG_SCOPE'],
 ['missing grant',f=>delete f.context.grant,'AUTHORITY_DENIED'],
 ['revoked grant',f=>f.context.grant.revoked=true,'AUTHORITY_DENIED'],
 ['expired grant',f=>f.context.now+=100,'AUTHORITY_DENIED'],
 ['wrong actor',f=>f.context.actor_ref='other','AUTHORITY_DENIED'],
 ['wrong purpose',f=>f.context.purpose='other','AUTHORITY_DENIED'],
 ['wrong target',f=>f.context.grant.targets=[],'AUTHORITY_DENIED'],
 ['wrong fields',f=>f.context.grant.fields=[],'FIELD_SCOPE'],
 ['missing source map',f=>delete f.context.source_map,'SOURCE_AUTHORITY_BLOCKED'],
 ['stale source',f=>f.context.source_map.entries[0].observed_at=now-2000,'SOURCE_AUTHORITY_BLOCKED'],
 ['source conflict',f=>f.context.source_map.entries[0].conflict=true,'SOURCE_AUTHORITY_BLOCKED'],
 ['wrong writer',f=>f.context.source_map.entries[0].writer='other','SOURCE_AUTHORITY_BLOCKED'],
 ['missing evidence',f=>delete f.command.evidence_ref,'SOURCE_EVIDENCE_REQUIRED'],
 ['wrong source',f=>f.command.source_ref='other','SOURCE_EVIDENCE_REQUIRED'],
 ['stale revision',f=>f.command.expected_revision=1,'REVISION_CONFLICT'],
 ['rights bypass',f=>{f.command.data={kind:'unit',ownership:'owner'};f.command.fields.push('ownership');f.context.grant.fields.push('ownership');},'PROPERTY_FIELDS']
])test(name+' fails closed',()=>{const f=fixture();change(f);assert.throws(()=>execute(emptyState('org'),f.command,f.context),new RegExp(error));});
test('property update retains original sourced history',()=>{const s=propertyState(),r=run(s,'property.update','p1',{attributes:{label:'updated'}});assert.equal(r.state.properties[0].history.length,2);assert.equal(s.properties[0].history.length,1);});
test('unit relation requires real child',()=>assert.throws(()=>run(propertyState(),'property.unit.link','p1',{parent_property_id:'p1',child_property_id:'p2',effective_from:'2026-01-01'}),/PROPERTY_REFERENCE/));
test('parent grant never confers child scope',()=>{const s=run(propertyState(),'property.create','p2',{kind:'unit'}).state,f=fixture('property.unit.link','p1',{parent_property_id:'p1',child_property_id:'p2',effective_from:'2026-01-01'});f.command.expected_revision=s.revision;assert.throws(()=>execute(s,f.command,f.context),/CHILD_AUTHORITY_SCOPE/);});
test('containment rejects cycles',()=>{let s=run(propertyState(),'property.create','p2',{kind:'unit'}).state;s=run(s,'property.unit.link','p1',{parent_property_id:'p1',child_property_id:'p2',effective_from:'2026-01-01'}).state;assert.throws(()=>run(s,'property.unit.link','p2',{parent_property_id:'p2',child_property_id:'p1',effective_from:'2026-01-01'}),/CYCLE/);});
test('mandate activation preserves immutable version and separate transition',()=>{const s=mandateState();assert.equal(s.mandates[0].versions[0].status,'DRAFT');assert.equal(s.mandates[0].transitions[0].to,'ACTIVE');});
test('mandate activation does not arise from ownership label',()=>{const s=mandateState();assert.throws(()=>run(s,'mandate.revoke','m1',{version_no:2}),/EXACT_VERSION/);});
test('listing requires exact active mandate',()=>assert.throws(()=>run(propertyState(),'listing.create','l1',{version_no:1,property_scope:[{property_id:'p1',scope_role:'offered'}],mandate_id:'absent',mandate_version_no:1},'ListingVersion'),/MANDATE_REQUIRED/));
const listingData={version_no:1,property_scope:[{property_id:'p1',scope_role:'offered'}],mandate_id:'m1',mandate_version_no:1,terms:{source:'commercial-v1'},media_refs:['doc-v1']};
test('listing approval requires competent exact binding',()=>assert.throws(()=>run(mandateState(),'listing.create','l1',listingData),/COMPETENT/));
test('expired mandate blocks listing despite ACTIVE transition',()=>{const s=mandateState();s.mandates[0].versions[0].effective_until='2026-10-02T00:00:00Z';assert.throws(()=>run(s,'listing.create','l1',listingData,'ListingVersion'),/MANDATE_REQUIRED/);});
test('listing remains independent and withdrawal preserves approved bytes',()=>{let s=run(mandateState(),'listing.create','l1',listingData,'ListingVersion').state;s=run(s,'listing.withdraw','l1',{version_no:1,reason:'owner request'}).state;assert.equal(s.properties.length,1);assert.equal(s.listings[0].versions[0].status,'APPROVED');assert.equal(s.listings[0].transitions.at(-1).to,'WITHDRAWN');});
test('revocation blocks listing reactivation',()=>{let s=run(mandateState(),'listing.create','l1',listingData,'ListingVersion').state;s=run(s,'listing.withdraw','l1',{version_no:1}).state;s=run(s,'mandate.revoke','m1',{version_no:1}).state;assert.throws(()=>run(s,'listing.reactivate','l1',{version_no:1},'ListingReactivation'),/MANDATE_REQUIRED/);});
test('read returns only authorized fields',()=>{const s=propertyState(),f=fixture('property.read','p1',{});f.command.fields=['property_id'];assert.deepEqual(execute(s,f.command,f.context).result,[{property_id:'p1'}]);});
test('mutation response does not leak ungranted sourced history',()=>{const f=fixture(),r=execute(emptyState('org'),f.command,f.context);assert.deepEqual(r.result.fields,{kind:'unit'});assert.equal(Object.hasOwn(r.result.fields,'history'),false);});
test('search never retrieves unauthorized other property',()=>{const s=run(propertyState(),'property.create','p2',{kind:'unit'}).state,f=fixture('property.search','p1',{});f.command.fields=['property_id'];assert.deepEqual(execute(s,f.command,f.context).result,[{property_id:'p1'}]);});
