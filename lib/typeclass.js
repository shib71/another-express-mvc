var smartclass = require("smartclass");
var fs = require("fs");
var path = require("path");

module.exports = TypeClass = smartclass.extendWith("TypeClass",{
  init : function(doc){
    this.doc = {};
    
    for (var k in doc){
      this.doc[k] = doc[k];
    }
    
    this.doc.type = this.classname;
  },
  
  toJSON : function(){
    var newdoc = {};
    
    for (var k in this.doc)
      newdoc[k] = this.doc[k];
    
    newdoc.type = this.classname;
    
    return newdoc;
  },
  
  save : function(){
    if (this.db){
      return this.db.save(this);
    }
    else {
      throw new Error("This type has not been associated with a DB");
    }
  },
  
  get : function(id){
    if (this.db){
      return this.db.get(id);
    }
    else {
      throw new Error("This type has not been associated with a DB");
    }
  },
  
  designs : {},
  routes : {},
  urls : {},
  routeprefix : "",
  
  unenumerable : [ "extendWith", "classname", "designs", "routes", "urls" ]
});

TypeClass.discover = function(basepath){
  return fs.readdirSync(basepath)
    .filter(function(f){ return f.search(/\.js$/) > -1 && f.search('#') === -1; })
    .map(function(f){
      return require(path.join(basepath,f));
    });
};