var smartclass = require("smartclass");
var util = require("util");
var repl = require("repl");
var net = require("net");

module.exports = DebugREPL = smartclass.extendWith("DebugREPL",{
  init : function(config){
    var self = this;
    
    config = config || {};
    config.port = config.port || 5001;
    
    this.config = config;
    this.connections = 0;
    
    this._socket = net.createServer(function (socket) {
      self.connections += 1;
      
      this._repl = repl.start({
        prompt: "DEBUG> ",
        input: socket,
        output: socket
      }).on('exit', function() {
        self.connections -= 1;
        socket.end();
      });
      
      this._repl.context.server = config.server;
    }).listen(config.port);
    
    util.puts("Debug REPL listening on port "+config.port);
  },
  
  destroy : function(){
    this._socket.close();
  }
});