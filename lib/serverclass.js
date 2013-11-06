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
var browserify = require("browserify-middleware");
var connectCouchDB = require("connect-couchdb")(express);
var events = require("events");

module.exports = ApplicationClass = smartclass.extendWith("ApplicationClass",events.EventEmitter,{
  init : function(config){
    if (config.typepath){
      config.types = typeclass.discover(config.typepath);
    }
    
    for (var i=0; i<config.types.length; i++)
      config.types[i].server = config.types[i].prototype.server = this;
    
    this.config = config;
    
    this.loadDBs(config);
    this.loadTemplates(config);
    this.loadURLs(config);
    this.createExpress(config);
    
    this.debug = config.debug || false;
  },
  
  loadDBs : function(config){
    this.dbs = this.dbs || {};
    config.dbs = config.dbs || {};

    for (var k in config.dbs)
      config.dbs[k].types = config.dbs[k].types || [];

    config.dbs["default"] = config.dbs["default"] || {
      db : config.db,
      databasename : config.databasename, 
      host : config.dbhost, 
      port : config.dbport,
      types : []
    };
    config.dbs["default"].types = config.types.map(function(t){ 
      return t.classname; 
    }).filter(function(t){
      var def = true;

      for (var k in config.dbs){
        def = def && (config.dbs[k].types.indexOf(t) === -1);
      }

      return def;
    });

    for (var k in config.dbs)
      this.loadDB(k,config.dbs[k]);
  },

  loadDB : function(name,config){
    var self = this;

    this.dbs = this.dbs || {};

    if (config.db){
      this.dbs[name] = config.db;

      this.dbs[name].loadTypes(self.config.types.filter(function(t){
        return config.types.indexOf(t.classname) > -1;
      }));
    }
    else{
      this.dbs[name] = new dbclass({
        name: name,
        databasename : config.databasename,
        dbhost : config.dbhost,
        dbport : config.dbport,
        types : self.config.types.filter(function(t){
          return config.types.indexOf(t.classname) > -1;
        })
      });
    }

  },

  loadTemplates : function(config){
    this.templates = {}, self = this;
    
    if (config.jadepath === undefined)
      return;

    if (config.browserifypath && config.browserifytemplatepath === undefined)
      config.browserifytemplatepath = path.join(config.browserifypath,"templates");

    for (var i=0, ii=config.types.length; i<ii; i++){
      if (fs.existsSync(path.join(config.jadepath,config.types[i].classname))){
        this.templates[config.types[i].classname] = qjade.discover(
          path.join(config.jadepath,config.types[i].classname),{
            name : function(f){
              return f.relativepath.replace(/\.jade$/,'').replace(/\//g,".").toLowerCase();
            },
            public : function(f){
              return config.browserifytemplatepath !== undefined && f.relativepath.search(/^public\//i) !== -1;
            },
            staticpath : function(f){
              return config.browserifytemplatepath !== undefined ? path.join(config.browserifytemplatepath,config.types[i].classname,f.relativepath.replace(/\//g,'.').replace(/\.jade$/,".js").toLowerCase()) : "";
            }
          }
        );
      }
      else if (this.debug){
        util.puts("Type ["+config.types[i].classname+"] does not have a view directory under ["+config.jadepath+"]");
      }
      
      config.types[i].render = config.types[i].prototype.render = function(){
        var args = Array.prototype.slice.call(arguments);

        if (args.length < 3)
          args.unshift(this.classname);

        var type = args[0], template = args[1], locals = args[2];

        if (self.templates[type] === undefined)
          throw new Error("Type ["+type="] has not been loaded");
        
        if (self.templates[type][template.toLowerCase()] === undefined)
          throw new Error("Template ["+template+"] has not been loaded for type ["+type+"]");
        
        return self.templates[type][template.toLowerCase()].render(locals);
      }

      this[config.types[i].classname] = config.types[i];
    }
  },
  
  loadURLs : function(config){
    this.urls = {}, route = [], type = "", method = "", self = this;
    
    if (config.browserifypath && config.browserifyurlpath === undefined)
      config.browserifyurlpath = path.join(config.browserifypath,"urls");

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
          jspath : config.browserifyurlpath ? path.join(config.browserifyurlpath,type.classname,method+".js") : undefined
        });
      }

      config.types[i].url = config.types[i].prototype.url = function(){
        var args = Array.prototype.slice.call(arguments);

        if (self.urls[args[0]] === undefined)
          args.unshift(this.classname);

        return self.url.apply(self,args);
      }
    }
  },
  
  createExpress : function(config){
    var app = this._express = express();

    app.set('port', config.port || 3000);
    app.set('views', config.viewspath);
    app.set('view engine', 'jade');
    app.set('db',this.dbs.default);
    app.use(express.favicon());
    
    if ('development' == app.get('env'))
      app.use(express.logger('dev'));
    
    app.use(express.bodyParser());
    app.use(express.compress());
    app.use(express.methodOverride());

    if (config.dbs.sessions){
      config.cookieSecret = config.dbs.sessions.databasename;

      app.use(express.cookieParser());
      app.use(express.session({
        secret : config.cookieSecret, 
        store : new connectCouchDB({
          // Name of the database you would like to use for sessions.
          name: config.dbs.sessions.databasename,

          // Optional. How often expired sessions should be cleaned up.
          // Defaults to 600000 (10 minutes).
          reapInterval: 600000,

          // Optional. How often to run DB compaction against the session
          // database. Defaults to 300000 (5 minutes).
          // To disable compaction, set compactInterval to -1
          compactInterval: 300000,

          // Optional. How many time between two identical session store
          // Defaults to 60000 (1 minute)
          setThrottle: 60000
        })
      }));
    }

    app.use(app.router);
    
    if (config.browserifypath && config.browserifyroute){
      config.browserify

      browserify.settings("mode",config.debug ? "development" : "production");
      
      var browserifyoptions = {};
      
      if (config.browserifycommon && config.browserifycommon.length){
        app.get(path.join(config.browserifyroute,"common.js"),browserify(config.browserifycommon));
        browserifyoptions.external = config.browserifycommon;
      }

      app.use(config.browserifyroute,browserify(config.browserifypath, browserifyoptions));
    }

    if (config.staticpath){
      app.use(express.static(config.staticpath));
    }
    
    app.locals({
      url : this.url,
      dresstext : this.dresstext
    });
    
    this.attachTypeRoutes(app,config);

    if ('development' == app.get('env'))
      app.use(express.errorHandler());

    return app;
  },

  attachTypeRoutes : function(app,config){
    var route = [], routefns = [], type = "", self = this;
    
    for (var i=0, ii=config.types.length; i<ii; i++){
      type = config.types[i];
      
      for (var k in type.prototype.routes){
        route = k.split(" ");
        
        this.routes[route[1]] = { 
          type : type.classname,
          methods : type.prototype.routes[k]
        };
        
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
  },
  
  preRoute : function(req,res,next){
    this.overrideRenderers(res);

    res.url = this.url;
    
    res.locals.render = this.createStaticRenderer(res);
    res.locals.session = req.session;
    
    this.emit("REQUEST~"+req.route.path,"request",{ 
      url : req.url,
      params : req.params,
      body : req.body,
      session : req.session
    });
    
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
        
        // set flag on templates
        for (var type in this.templates){
          for (var template in this.templates[type]){
            this.templates[type][template].debug = v;
          }
        }
        
        // set flag on databases
        for (var db in this.dbs){
          this.dbs[db].debug = v;
        }
        
        // set flag on types
        for (var i=0; i<this.config.types.length; i++)
          this.config.types[i].prototype.debug = true;

        // enable or disable the REPL
        if (v){
          this._repl = new repl({
            server : this
          });
        }
        else {
          if (this._repl) {
            this._repl.destroy();
            delete this._repl;
          }
        }
        
        // enable / disable Q traces
        Q.longStackSupport = v;

        // enable / disable browserify debugging
        browserify.settings("mode",v ? "development" : "production");
        
        // enable / disable JSON response pretty printing
        this.express.set("json spaces",v);
      }
    }
  },
  
  overrideRenderers : function(res){
    var render = res.render, json = res.json, send = res.send, self = this;

    res.render = function(type,template,locals,callback){
      res.render = render;
      res.json = json;
      res.send = send;

      if (typeof(locals) === "function"){
        callback = locals;
        locals = {};
      }
      else if (locals === undefined){
        locals = {};
      }

      return smartclass.deepResolve(Array.prototype.slice.call(arguments),true).spread(function(type,template,locals,callback){
        // clean up / validate arguments
        if (self.templates[type] === undefined)
          throw new Error("Type ["+type+"] has not been loaded");
        
        if (self.templates[type][template.toLowerCase()] === undefined)
          throw new Error("Template ["+template+"] has not been loaded for type ["+type+"]");

        res.renderlocals = locals;
        
        self.emit("RESPONSE~"+res.req.route.path,"response",{ 
          method : "render",
          template : self.templates[type][template.toLowerCase()].jadepath,
          locals : locals
        });
        
        return res.render(self.templates[type][template.toLowerCase()].jadepath,locals,callback);
      });
    };

    res.send = function(){
      res.render = render;
      res.json = json;
      res.send = send;

      return smartclass.deepResolve(Array.prototype.slice.call(arguments),true).then(function(args){
        self.emit("RESPONSE~"+res.req.route.path,"response",{ 
          method : "send",
          data : args
        });
        
        return res.send.apply(res,args);
      });
    },
    
    res.json = function(){
      res.render = render;
      res.json = json;
      res.send = send;
      
      return smartclass.deepResolve(Array.prototype.slice.call(arguments),true).then(function(args){
        self.emit("RESPONSE~"+res.req.route.path,"response",{ 
          method : "json",
          data : args
        });
        
        return res.json.apply(res,args);
      });
    }
  },

  createStaticRenderer : function(res){
    var self = this;

    return function(type,template,locals){
      // clean up / validate arguments
      if (self.templates[type] === undefined)
        throw new Error("Type ["+type+"] has not been loaded");
      
      if (self.templates[type][template.toLowerCase()] === undefined)
        throw new Error("Template ["+template+"] has not been loaded for type ["+type+"]");

      var renderlocals = {};
      
      if (locals){
        for (var k in locals){
          renderlocals[k] = locals[k];
        }
      }
      
      if (res.renderlocals){
        for (var k in res.renderlocals){
          renderlocals[k] = res.renderlocals[k];
        }
      }

      for (var k in res.locals){
        if (renderlocals[k]===undefined) renderlocals[k] = res.locals[k];
      }
      
      for (var k in res.app.locals){
        if (renderlocals[k]===undefined) renderlocals[k] = res.app.locals[k];
      }
      
      return self.templates[type][template.toLowerCase()].renderStatic(renderlocals);
    };
  },

  url : function(){
    var args = Array.prototype.slice.call(arguments), type = args.shift(), route = args.shift();
    
    if (this.urls[type] === undefined)
      throw new Error("Type ["+type="] has not been loaded");
    
    if (this.urls[type][route] === undefined)
      throw new Error("Route ["+route+"] has not been loaded for type ["+type+"]");
    
    return this.urls[type][route].apply(this[type],args);
  },
  
  routes : {},
  
  bind : [ "url", "preRoute" ]
});