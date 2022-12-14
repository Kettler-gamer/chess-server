require("dotenv").config();
const http = require("http");
const ws = require("ws");

const wss = new ws.Server({ noServer: true });
const clients = new Set();

const players = [{ player: null }, { player: null }];
let playerTurn = 0;

function accept(req, res) {
  // all incoming requests must be websockets
  if (
    !req.headers.upgrade ||
    req.headers.upgrade.toLowerCase() != "websocket" ||
    clients.size == 2
  ) {
    res.end();
    return;
  }

  // can be Connection: keep-alive, Upgrad
  if (!req.headers.connection.match(/\bupgrade\b/i)) {
    res.end();
    return;
  }

  wss.handleUpgrade(req, req.socket, Buffer.alloc(0), onConnect);
}

function onConnect(ws) {
  clients.add(ws);
  ws.on("message", function (message) {
    if (ws != players[playerTurn].player) {
      ws.send("Not your turn!");
    }
    message = message.toString();
    console.log(message);
    commandHandler(message);
  });

  ws.on("close", () => {
    clients.delete(ws);
  });

  if (clients.size == 2) {
    players[1].player = ws;
    on2Players();
  } else {
    players[0].player = ws;
  }
}

function on2Players() {
  clients.forEach((client) => {
    client.send("2 players connected!");
  });
  let whoPlaysWhite = Math.floor(Math.random() * 11);
  if (whoPlaysWhite > 5) {
    players[0].player.send("start-black");
    players[1].player.send("start-white");
    playerTurn = 1;
  } else {
    players[0].player.send("start-white");
    players[1].player.send("start-black");
    playerTurn = 0;
  }
}

if (!module.parent) {
  http.createServer(accept).listen(Number(process.env.PORT));
} else {
  exports.accept = accept;
}

function commandHandler(command) {
  switch (true) {
    case command.startsWith("moved"):
      updateMovedPiece(command);
      break;
    default:
      console.log("Unkown command: " + command);
      break;
  }
}

function updateMovedPiece(command) {
  playerTurn = (playerTurn + 1) % 2;
  players[playerTurn].player.send(command);
}
