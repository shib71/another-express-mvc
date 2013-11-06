var smartclass = require("smartclass");
var fs = require("fs");
var path = require("path");
var Q = require("q");

module.exports = TypeClass = smartclass.extendWith("TypeClass",{
  init : function(doc){
    this.doc = {};
    
    for (var k in doc){
      this.doc[k] = doc[k];
      this[k] = doc[k];
    }
    
    this.doc.type = this.classname;
  },
  
  toDB : function(config){
    var newdoc = {};
    
    config = config || {};

    for (var k in this.doc){
      if ((config.include === undefined && config.exclude === undefined) ||
        (config.include && config.include.indexOf(k) > -1) || 
        (config.exclude && config.exclude.indexOf(k) === -1)){

        newdoc[k] = this.doc[k];
      }
    }
    
    newdoc.type = this.classname;
    
    return newdoc;
  },
  
  toJSON : function(config){
    var newdoc = {};
    
    config = config || {
      exclude : [ "doc", "design", "routes", "classname", "server", "db", "_debug", "debug", "routeprefix" ]
    };

    for (var k in this){
      if ((config.include === undefined && config.exclude === undefined) ||
        (config.include && config.include.indexOf(k) > -1) || 
        (config.exclude && config.exclude.indexOf(k) === -1)) {
        
        if (typeof(this[k])!=="function" || Q.isPromise(this[k]))
          newdoc[k] = this[k];
      }
    }
    
    newdoc.type = this.classname;
    
    return newdoc;
  },
  
  save : function(){
    var self = this;
    
    if (this.db){
      return this.db.saveDoc(this).then(function(rev){
        self.set({
          _rev : rev.rev
        });
        
        return self;
      });
    }
    else {
      throw new Error("This type has not been associated with a DB");
    }
  },
  
  get : function(id,config){
    if (this.db)
      return this.db.getDoc(id);
    else
      throw new Error("This type has not been associated with a DB");
  },
  
  set : function(props){
    for (var k in props){
      this.doc[k] = props[k];
      this[k] = props[k];
    }
    
    return this;
  },

  debug : {
    get : function(){
      return this._debug || false;
    },
    set : function(v){
      if (this._debug !== v){
        this._debug = v;
      }
    }
  },
  
  design : {},
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