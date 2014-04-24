var smartclass = require("smartclass");
var fs = require("fs");
var path = require("path");
var Q = require("q");
var aefv = require("aef-validation");
var util = require("util");

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
    
    config = config || this.json_exclude || {
      exclude : [ "doc", "design", "routes", "classname", "server", "_server", "db", "_debug", "debug", "routeprefix" ]
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
          _id : rev.id,
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
  
  server : {
    get : function(){
      return this._server || undefined;
    },
    set : function(v){
      var route = [];
      
      if (this._server !== v){
        if (this._server)
          this.dettachServer(this._server);
        
        this._server = v;
        
        if (this._server)
          this.attachServer(this._server);
      }
    }
  },
  
  dettachServer : function(server){
    var route = [], fns = [];
    
    if (server === undefined)
      return;
    
    for (var k in this.routes){
      route = k.split(" "), fns = this.routes[k];
      
      if (typeof(fns) === "string")
        fns = fns.split(" ");
      else if (!util.isArray(fns))
        throw new Error("Route ["+k+"] on ["+this.classname+"] is not a method name or array of method names");
      
      /* remove routes attached to previous server */
      server.removeRoute(this.classname,fns[fns.length-1],route[0],route[1]);
    }
    
    if (this.debug){
      util.puts("Dettached ["+this.classname+"] from server");
    }
  },
  
  attachServer : function(server){
    var routefuns = [], fns = [], self = this;
    
    if (server === undefined)
      return;
    
    for (var k in this.routes){
      route = k.split(" ");
      
      /* attach routes to new server */
      routefns = [], fns = this.routes[k], self = this;
      
      if (typeof(fns) === "string")
        fns = fns.split(" ");
      else if (!util.isArray(fns))
        throw new Error("Route ["+k+"] on ["+this.classname+"] is not a method name or array of method names");
      
      fns.forEach(function(thisfn){
        if (self[thisfn] === undefined)
          throw new Error("Route ["+k+"] on ["+self.classname+"] refers to undefined method ["+thisfn+"]");
        
        if (self[thisfn+"_validation"])
          routefns.push(aefv.middleware(self[thisfn+"_validation"],self));
        
        routefns.push(self[thisfn].bind(self));
      });
      
      /* add urls to new server */
      server.addRoute(this.classname,fns[fns.length-1],route[0],route[1],routefns);
    }
    
    if (this.debug){
      util.puts("Attached ["+this.classname+"] to server");
    }
  },
  
  url : function(){
    var args = Array.prototype.slice.call(arguments), server = this.server;
    
    if (server === undefined)
      throw new Error("Type ["+this.classname+"] has not been attached to a server");
    
    return server.url.apply(self,args);
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
  
  unenumerable : [ "extendWith", "classname", "designs", "routes", "urls", "_debug", "_express", "_server" ]
});

TypeClass.discover = function(basepath){
  return fs.readdirSync(basepath)
    .filter(function(f){ return f.search(/\.js$/) > -1 && f.search('#') === -1; })
    .map(function(f){
      return require(path.join(basepath,f));
    });
};