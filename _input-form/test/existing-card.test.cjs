const {test}=require('node:test');
const assert=require('node:assert/strict');
const {find}=require('../../betweenusfriends/existing-card.js');
const card={id:1,name:"Cervo’s",place:"Cervo's, 43 Canal St, New York",city:'NYC',lat:40.7148624,lng:-73.9913446,mapsURL:'https://maps.google.com/?cid=123'};
test('Google location identity catches a renamed card and manual Maps URL',()=>{
 assert.equal(find({maps:'https://maps.google.com/?cid=123&hl=en'},[card]),card);
 assert.equal(find({placeId:'ChIJabc'},[{...card,mapsURL:'https://www.google.com/maps/search/?api=1&query=a&query_place_id=ChIJabc'}]).id,1);
});
test('legacy cards match the Google name or alias only at the same location',()=>{
 assert.equal(find({name:"Cervo's",lat:40.71486,lng:-73.99134},[card]),card);
 assert.equal(find({name:'Caffe Panna',lat:40.71486,lng:-73.99134},[{...card,name:'Cafe Panna',place:'Caffè Panna, 77 Irving Pl'}]).id,1);
 assert.equal(find({name:"Cervo's",lat:40.73486,lng:-73.99134},[card]),null);
 assert.equal(find({name:'Different restaurant',lat:card.lat,lng:card.lng},[card]),null);
 assert.equal(find({name:card.name,lat:card.lat,lng:card.lng},[{...card,nearest:true}]),null);
});
test('same name alone, other branches, or conflicting Google identities do not flag a duplicate',()=>{
 assert.equal(find({name:card.name,city:'NYC'},[card]),null);
 assert.equal(find({name:card.name,lat:card.lat,lng:card.lng,maps:'https://maps.google.com/?cid=456'},[card]),null);
 assert.equal(find({name:card.name,lat:null,lng:null},[card]),null);
 assert.equal(find({maps:'https://www.google.com/maps/search/?api=1&query=Cervos'},[card]),null);
 assert.equal(find({maps:'https://evil.example/?cid=123'},[card]),null);
});
