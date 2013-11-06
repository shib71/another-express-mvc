var smartclass = require("smartclass");
var qcouch = require("qcouch");
var typeclass = require("./typeclass");

module.exports = DBClass = smartclass.extendWith("DBClass",{
  init : function(config){
    var self = this;
    
    if (!config.databasename)
      throw new Error("'databasename' is required for instantiating DBClass");

    this.name = config.name;

    config.host = config.host || "localhost";
    config.port = config.port || 5984;
    
    this.db = new qcouch({
      name: config.name,
      databasename: config.databasename,
      host: config.host,
      port: config.port,
      designs: this.getTypeDesigns(config.types),
      
      toDB : function(doc){
        var newdoc = {};
        
        if (doc.toDB){
          newdoc = doc.toDB();
        }
        else if (doc.toJSON){
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

    this.mountTypes(config.types);
  },

  getTypeDesigns : function(types){
    var designs = {};

    for (var i=0, ii=types.length; i<ii; i++){
      designs[types[i].classname] = types[i].prototype.design;
    }

    return designs;
  },

  mountTypes : function(types){
    for (var i=0, ii=types.length; i<ii; i++){
      this[types[i].classname] = types[i];
    }
    
    for (var i=0, ii=types.length; i<ii; i++){
      types[i].db = types[i].prototype.db = this.db;
      
      if (types[i].prototype.design.views){
        for (var k in types[i].prototype.design.views){
          types[i]["get"+k.slice(0,1).toUpperCase()+k.slice(1)] 
            = types[i].prototype["get"+k.slice(0,1).toUpperCase()+k.slice(1)] 
            = this.viewFn(types[i].classname,k);
        }
      }
    }
  },

  loadTypes : function(types,intoDB){
    this.db.designs = this.getTypeDesigns(types);
    this.mountTypes(types);
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
  
  debug : {
    get : function(){
      return this._debug;
    },
    set : function(v){
      if (this._debug !== v){
        this._debug = v;
        
        // set flag on qcouch
        this.db.debug = v;
      }
    }
  },

  bind : [ "save", "get" ]
});