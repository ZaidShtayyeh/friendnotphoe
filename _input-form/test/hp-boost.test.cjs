const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const validate=require('../../betweenusfriends/validate.js');
const html=fs.readFileSync(require('node:path').join(__dirname,'../../betweenusfriends/index.html'),'utf8');
const source=html.slice(html.indexOf('    var hpBoosts = 0;'),html.indexOf("    var currentColor = 'neutral';"));
function setup(values={food:'80',drinks:'70',scene:'90'}) {
 const events={};const els={};
 for(const [id,value] of Object.entries(values))els[id]={value};
 els['hp-boost']={addEventListener(k,fn){events[k]=fn;}};els['hp-boost-status']={};
 const c={Object,String,NoBallValidate:validate,limits:validate.LIMITS,$:id=>els[id],form:{addEventListener(k,fn){events[k]=fn;}},refresh(){c.updateHpBoost();}};
 vm.runInNewContext(source,c);c.updateHpBoost();return {c,events,els,total:()=>validate.hpFromStats(c.hpStats(),c.hpBoosts)};
}
test('boost three times, never a fourth, without moving rating inputs; new card resets it',()=>{
 const {c,events,els,total}=setup();
 for(const expected of [260,280,300]){assert.equal(els['hp-boost'].disabled,false);events.click();assert.equal(total(),expected);}
 assert.equal(els['hp-boost'].disabled,true);events.click();assert.equal(c.hpBoosts,3);
 assert.deepEqual(['food','drinks','scene'].map(k=>els[k].value),['80','70','90']);
 events.reset();assert.equal(c.hpBoosts,0);
});
test('only complete valid ratings can boost and each click needs room for twenty',()=>{
 for(const values of [{food:'80',drinks:'',scene:'90'},{food:'101',drinks:'70',scene:'90'},{food:'95',drinks:'95',scene:'95'}]){
  const {c,events,els}=setup(values);assert.equal(els['hp-boost'].disabled,true);events.click();assert.equal(c.hpBoosts,0);
 }
 const {events,total,els}=setup({food:'100',drinks:'90',scene:'90'});events.click();assert.equal(total(),300);assert.equal(els['hp-boost'].disabled,true);
});
test('editing stats after boosting keeps HP capped and does not restore used boosts',()=>{
 const {c,events,els,total}=setup();events.click();els.food.value='100';els.drinks.value='100';els.scene.value='100';c.updateHpBoost();
 assert.equal(total(),300);assert.equal(els['hp-boost'].disabled,true);assert.equal(c.hpBoosts,1);
 els.food.value='0';c.updateHpBoost();assert.equal(total(),220);assert.equal(els['hp-boost'].disabled,false);assert.equal(c.hpBoosts,1);
});
