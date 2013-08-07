var smartclass = require("smartclass");
var dbclass = require("./dbclass");
var typeclass = require("./typeclass");
var repl = require("./repl");
var path = require("path");
var qjade = require("qjade");
var express = require("express");
var routetemplate = require("routetemplate");
var util = require("util");
var fs = require("fs");
var path = require("path");
var Q = require("q");
var connectutils = require("connect").utils;

module.exports = ApplicationClass = smartclass.extendWith("ApplicationClass",{
  init : function(config){
    if (config.typepath){
      config.types = typeclass.discover(config.typepath);
    }
    
    this.config = config;
    
    this.loadDB(config);
    this.loadTemplates(config);
    this.loadURLs(config);
    this.createExpress(config);
    
    this.debug = config.debug || false;
  },
  
  loadDB : function(config){
    if (config.db){
      this.db = config.db;
    }
    else {
      var dbconfig = {
        databasename : config.databasename,
        host : config.dbhost,
        port : config.dbport,
        types : config.types
      };
      
      this.db = new dbclass(dbconfig);
    }
  },
  
  loadTemplates : function(config){
    this.templates = {};
    
    for (var i=0, ii=config.types.length; i<ii; i++){
      this.templates[config.types[i].classname] = qjade.discover(
        path.join(config.jadepath,config.types[i].classname),{
          name : function(f){
            return f.relativepath.replace(/\.jade$/,'').replace("/",".").toLowerCase();
          },
          public : function(f){
            return config.templatejspath !== undefined && f.relativepath.search(/^public\//) !== -1;
          },
          staticpath : function(f){
            return path.join(config.templatejspath,path.basename(f.relativepath,".jade")+".js");
          }
        }
      );
      
      this[config.types[i].classname] = config.types[i];
    }
  },
  
  loadURLs : function(config){
    this.urls = {}, route = [], type = "", method = "";
    
    for (var i=0, ii=config.types.length; i<ii; i++){
      type = config.types[i];
      this.urls[type.classname] = {};
      
      for (var k in type.prototype.routes){
        route = k.split(" ");
        
        if (route.length < 2)
          throw new Error("Route key '"+k+"' on "+type.classname+" is invalid. Routes must be in the form 'METHOD PATH', e.g. 'GET /' or 'ALL /posts'");

        if (route.length > 2)
          method = route[2];
        else if (util.isArray(type.prototype.routes))
          method = type.prototype.routes[k][type.prototype.routes[k].length-1];
        else
          method = type.prototype.routes[k];
        
        this.urls[type.classname][method] = routetemplate({ 
          route : route[1],
          jspath : path.join(config.urljspath,type.classname,method+".js")
        });
      }
    }
  },
  
  createExpress : function(config){
    var app = this._express = express(), route = [], routefns = [], self = this, type = "";
    
    app.set('port', config.port || 3000);
    app.set('views', config.viewspath);
    app.set('view engine', 'jade');
    app.set('db',this.db);
    app.use(express.favicon());
    
    if ('development' == app.get('env'))
      app.use(express.logger('dev'));
    
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(app.router);
    
    if (config.staticpath)
      app.use(express.static(config.staticpath));
    
    if ('development' == app.get('env'))
      app.use(express.errorHandler());
    
    app.locals({
      url : this.url
    });
    
    for (var i=0, ii=config.types.length; i<ii; i++){
      type = config.types[i];
      
      for (var k in type.prototype.routes){
        route = k.split(" ");
        
        if (util.isArray(type.prototype.routes[k])){
          routefns = type.prototype.routes[k].map(function(f){ 
            if (type.prototype[f] === undefined)
              throw new Error("Route '"+k+"' on "+type.classname+" refers to undefined method '"+f);

            return type.prototype[f].bind(type.prototype); 
          });
        }
        else{
          if (type.prototype[type.prototype.routes[k]] === undefined)
            throw new Error("Route '"+k+"' on "+type.classname+" refers to undefined method '"+type.prototype.routes[k]+"'");

          routefns = [ type.prototype[type.prototype.routes[k]].bind(type.prototype) ];
        }
        
        routefns.unshift(self.preRoute);
        routefns.unshift(route[1]);
        
        app[route[0].toLowerCase()].apply(app,routefns);
      }
    }
    
    return app;
  },
  
  preRoute : function(req,res,next){
    res._render = res.render;
    res.render = this.responseRender(res,true);
    res.url = this.url;
    
    res.locals.render = this.responseRender(res,false);
    
    next();
  },
  
  express : {
    get : function(){
      if (this.config && this._express === undefined)
        this.createExpress(this.config);
      
      return this._express;
    },
    set : function(){
      throw new Error("express property is read-only");
    }
  },
  
  debug : {
    get : function(){
      return this._debug;
    },
    set : function(v){
      if (this._debug !== v){
        this._debug = v;
        
        for (var type in this.templates){
          for (var template in this.templates[type]){
            this.templates[type][template].debug = v;
          }
        }
        
        if (v){
          this._repl = new repl({
            server : this
          });
        }
        else 
          if (this._repl) {
            this._repl.destroy();
            delete this._repl;
          }
        
        Q.longStackSupport = v;
      }
    }
  },
  
  render : function(type,template,locals,res,renderresponse){
    if (this.templates[type] === undefined)
      throw new Error("Type ["+type+"] has not been loaded");
    
    if (this.templates[type][template.toLowerCase()] === undefined)
      throw new Error("Template ["+template+"] has not been loaded for type ["+type+"]");
    
    if (renderresponse){
      return res._render(this.templates[type][template.toLowerCase()].jadepath,locals);
    }
    else{
      var renderlocals = {};
      
      for (var k in locals){
        renderlocals[k] = locals[k];
      }
      
      for (var k in res.locals){
        if (renderlocals[k]===undefined) renderlocals[k] = res.locals[k];
      }
      
      for (var k in res.app.locals){
        if (renderlocals[k]===undefined) renderlocals[k] = res.app.locals[k];
      }
      
      return this.templates[type][template.toLowerCase()].renderStatic(renderlocals);
    }
  },
  responseRender : function(res,renderresponse){
    var self = this;
    
    if (renderresponse){
      return function(){
        return smartclass.deepResolve(Array.prototype.slice.call(arguments)).then(function(args){
          args.push(res);
          args.push(renderresponse);
          
          return Q.when(self.render.apply(self,args));
        });
      };
    }
    else{
      return function(){
        var args = Array.prototype.slice.call(arguments);
        
        args.push(res);
        args.push(renderresponse);
        
        return self.render.apply(self,args);
      };
    }
  },
  
  url : function(){
    var args = Array.prototype.slice.call(arguments), type = args.shift(), route = args.shift();
    
    if (this.urls[type] === undefined)
      throw new Error("Type ["+type="] has not been loaded");
    
    if (this.urls[type][route] === undefined)
      throw new Error("Route ["+route+"] has not been loaded for type ["+type+"]");
    
    return this.urls[type][route].apply(this[type],args);
  },
  
  bind : [ "render", "responseRender", "url", "preRoute" ]
});