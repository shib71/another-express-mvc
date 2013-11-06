var smartclass = require("smartclass");
var util = require("util");
var repl = require("repl");
var net = require("net");
var events = require("events");

var DebugREPL = module.exports = smartclass.extendWith("DebugREPL",{
  init : function(config){
    var self = this;
    
    config = config || {};
    config.port = config.port || 5001;
    
    this.config = config;
    this.connections = 0;
    this.repls = {};
    
    this._socket = net.createServer(this.newConnection).listen(config.port);
    
    util.puts("Debug REPL listening on port "+config.port);
  },
  
  destroy : function(){
    for (var socketid in this.repls)
      this.repls[socketid].exit("The server has been stopped");
    
    this._socket.close();
  },
  
  newConnection : function (socket) {
    var socketid = undefined, listeningTo = { server:{} };
    
    while (socketid === undefined || this.repls[socketid] !== undefined)
      socketid = Math.floor(Math.random() * 100000) + 1;
    
    this.connections += 1;
    
    this.repls[socketid] = new REPLServer({
      server : this.config.server,
      socket : socket,
      id : socketid
    });
    
    this.repls[socketid].on("exit",this.closedREPL);
  },
  
  closedREPL : function(socketid){
    delete this.repls[socketid];
  },
  
  bind : [ "newConnection", "closedREPL" ]
});

var REPLServer = smartclass.extendWith("REPLServer",events.EventEmitter,{
  init : function(config){
    this.socket = config.socket;
    this.server = config.server;
    this.id = config.id;
    this.listeningTo = { server:{} };
    
    this.repl = repl.start({
      prompt: "DEBUG> ",
      input: config.socket,
      output: config.socket
    }).on('exit', this.exit);
    
    
    this.repl.context.socketid = this.id;
    this.repl.context.server = {
      spy : this.spyRoute,
      spies : [],
      routes : config.server.routes
    };
    
    console.log("REPL connection ["+this.id+"] opened");
  },
  
  spyRoute : function(route){
    if (this.listeningTo.server[route]){
      this.server.removeListener("REQUEST~"+route,this.listeningTo.server[route]);
      this.server.removeListener("RESPONSE~"+route,this.listeningTo.server[route]);
    }
    
    this.listeningTo.server[route] = this.put;
    
    this.server.on("REQUEST~"+route,this.listeningTo.server[route]);
    this.server.on("RESPONSE~"+route,this.listeningTo.server[route]);
    
    this.repl.context.server.spies.push("ROUTE "+route);
    
    return "Spying on route ["+route+"]";
  },
  
  exit : function(message) {
    if (message && message.length)
      this.socket.write(message + "\n");
    
    this.socket.end();
    
    for (var k in this.listeningTo.server){
      this.server.removeListener("REQUEST~"+k,this.listeningTo.server[k]);
      this.server.removeListener("RESPONSE~"+k,this.listeningTo.server[k]);
    }
    
    console.log("REPL connection ["+this.id+"] closed");
    
    this.emit("exit",this.id);
  },
  
  put : function(label,data){
    this.socket.write(label.toUpperCase() + ": " + util.inspect(data,{ colors:true, depth:5 }) + "\n");
  },
  
  bind : [ "spyRoute", "exit", "put" ]
});