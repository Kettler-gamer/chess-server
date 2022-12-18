require("dotenv").config();
const http = require("http");
const ws = require("ws");

const wss = new ws.Server({ noServer: true });
const clients = new Set();

const rooms = [
  [{ player1: null, player2: null, playerTurn: 0 }],
  [{ player1: null, player2: null, playerTurn: 0 }],
  [{ player1: null, player2: null, playerTurn: 0 }],
  [{ player1: null, player2: null, playerTurn: 0 }],
];

function accept(req, res) {
  // all incoming requests must be websockets
  if (
    !req.headers.upgrade ||
    req.headers.upgrade.toLowerCase() != "websocket"
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
  if (isServerFull()) {
    ws.send("full server");
    ws.close();
    return;
  }
  clients.add(ws);
  ws.on("message", function (message) {
    commandHandler(message.toString(), ws);
  });

  ws.on("close", () => {
    checkPlayer(ws);
    synchronizeRooms(ws);
    clients.delete(ws);
  });

  ws.send(getRooms());
}

function checkPlayer(ws) {
  for (let room of rooms) {
    if (room.player1 == ws) {
      room.player1 = null;
      if (room.player2 != null) {
        room.player2.send("opponent-disconnected");
      }
      break;
    } else if (room.player2 == ws) {
      room.player2 = null;
      if (room.player1 != null) {
        room.player1.send("opponent-disconnected");
      }
      break;
    }
  }
}

function on2Players(room) {
  let whoPlaysWhite = Math.floor(Math.random() * 11);
  if (whoPlaysWhite > 5) {
    room.player1.send("start-black");
    room.player2.send("start-white");
    room.playerTurn = 1;
  } else {
    room.player1.send("start-white");
    room.player2.send("start-black");
    room.playerTurn = 0;
  }
}

function commandHandler(command, ws) {
  switch (true) {
    case command.includes("moved-piece"):
      updateMovedPiece(command, ws);
      break;
    case command.startsWith("join-room"):
      const joinRoomId = Number(command.replace("join-room ", ""));
      setPlayerToRoom(joinRoomId, ws);
      break;
    case command.startsWith("disconnect-room"):
      const leaveRoomId = Number(command.replace("disconnect-room ", ""));
      onLeaveRoom(leaveRoomId, ws);
      synchronizeRooms(ws);
      break;
    default:
      console.log("Unkown command: " + command);
      break;
  }
}

function onLeaveRoom(roomId, ws) {
  const room = rooms[roomId];
  if (room.player1 == ws) {
    room.player1 = null;
  } else if (room.player2 == ws) {
    room.player2 = null;
  } else {
    console.log(
      "Leave room error! Player was not in room they tried to disconnect from!"
    );
  }
  ws.send(getRooms());
}

function setPlayerToRoom(roomId, ws) {
  const room = rooms[roomId];

  if (room.player1 != null && room.player2 != null) {
    ws.send("full-room");
    return;
  }

  if (room.player1 == null) {
    room.player1 = ws;
  } else if (room.player2 == null) {
    room.player2 = ws;
    on2Players(room);
  }

  synchronizeRooms(ws);
  ws.send("connected-room " + roomId);
}

function updateMovedPiece(command, ws) {
  const commandArray = command.replace("moved-piece ", "").split(" ");
  const room = rooms[Number(commandArray[0])];
  if (
    (room.playerTurn == 1 && ws != room.player2) ||
    (room.playerTurn == 0 && ws != room.player1)
  ) {
    ws.send("not-your-turn");
    return;
  }
  room.playerTurn = (room.playerTurn + 1) % 2;
  if (room.playerTurn == 0) {
    room.player1.send(`moved ${commandArray[1]} ${commandArray[2]}`);
  } else {
    room.player2.send(`moved ${commandArray[1]} ${commandArray[2]}`);
  }
}

function synchronizeRooms(ignoreWs) {
  for (let ws of clients) {
    if (ws == ignoreWs) continue;
    ws.send(getRooms());
  }
}

function getRooms() {
  const command = ["rooms"];

  for (let room of rooms) {
    let currentPlayers = 0;
    if (room.player1 != null) currentPlayers++;
    if (room.player2 != null) currentPlayers++;
    command.push(currentPlayers.toString());
  }

  return command.join(" ");
}

function isServerFull() {
  for (let room of rooms) {
    if (room.player1 == null || room.player2 == null) return false;
  }
  return true;
}

if (!module.parent) {
  http.createServer(accept).listen(Number(process.env.PORT));
} else {
  exports.accept = accept;
}
