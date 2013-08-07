var smartclass = require("smartclass");
var qcouch = require("qcouch");
var typeclass = require("./typeclass");

module.exports = DBClass = smartclass.extendWith("DBClass",{
  init : function(config,db){
    var self = this;
    
    if (!config.databasename)
      throw new Error("'databasename' is required for instantiating DBClass");
    
    config.host = config.host || "localhost";
    config.port = config.port || 5984;
    config.types = config.types || [];
    
    if (config.typepath){
      config.types = typeclass.discover(config.typepath);
    }
    
    this.db = db;
    
    var designs = {};
    
    for (var i=0, ii=config.types.length; i<ii; i++){
      designs[config.types[i].classname] = config.types[i].prototype.design;
      this[config.types[i].classname] = config.types[i];
    }
    
    this.db = new qcouch({
      databasename: config.databasename,
      host: config.host,
      port: config.port,
      designs: designs,
      
      toDB : function(doc){
        var newdoc = {};
        
        if (doc.toJSON){
          newdoc = doc.toJSON();
        }
        else {
          for (var k in doc)
            newdoc[k] = doc[k];
        }
        
        return newdoc;
      },
      fromDB : function(doc){
        if (doc.type && self[doc.type]){
          return new self[doc.type](doc);
        }
        else{
          return doc;
        }
      }
    });
    
    for (var i=0, ii=config.types.length; i<ii; i++){
      config.types[i].db = config.types[i].prototype.db = this.db;
      
      if (config.types[i].prototype.design.views){
        for (var k in config.types[i].prototype.design.views){
          config.types[i]["get"+k.slice(0,1).toUpperCase()+k.slice(1)] 
            = config.types[i].prototype["get"+k.slice(0,1).toUpperCase()+k.slice(1)] 
            = this.viewFn(config.types[i].classname,k);
        }
      }
    }
    
  },
  
  viewFn : function(type,view){
    return function(query){
      return this.db.runView(type,view,query);
    };
  },
  
  save : function(doc){
    return this.db.saveDoc(doc);
  },
  get : function(id){
    return this.db.getDoc(id);
  },
  
  bind : [ "save", "get" ]
});