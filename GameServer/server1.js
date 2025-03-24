const socketIOOO = require('socket.io');
const OdinCircledbModel = require('../models/odincircledb');
const BetModel = require('../models/BetModel');
const WinnerModel = require('../models/WinnerModel');
const LoserModel = require('../models/LoserModel');
const BetCashModel = require('../models/BetCashModel');

const activeRooms = {};

const { Expo } = require('expo-server-sdk'); // Import expo-server-sdk

const expo = new Expo(); // Initialize Expo SDK
const redis = require('redis');
const client = redis.createClient();


const startSocketServer1 = (httpServer) => {
    const iooo = socketIOOO(httpServer);

    iooo.on('connection', (socket) => {
        console.log('A user connected tic1');

socket.on("joinRoom", async ({ playerName, userId, amount, expoPushToken, roomId }) => {
    console.log(`🔹 Player ${playerName} (ID: ${userId}) is trying to join a room with bet amount: ${amount}`);

    // Validate required fields
    if (!playerName || !userId || amount == null) {
        console.log("❌ Error: Missing required fields.");
        return socket.emit("invalidJoin", "Missing required fields");
    }

    // Look for an existing room with space
    let room = Object.values(activeRooms).find(r => r.amount === amount && r.players.length < 2);

    if (room) {
        console.log(`🔍 Found an existing room: ${room.roomId} with ${room.players.length} players.`);
    } else {
        // No available room, create a new one
        //const newRoomId = generateRoomId();
        console.log(`🆕 Creating a new Room with ID: ${roomId}`);

        room = {
            roomId,
            players: [],
            board: Array(16).fill(null),
            currentPlayer: 0,
            startingPlayer: 0,
            amount,
        };
        activeRooms[roomId] = room;
    }

    // If room is full, reject the request
    if (room.players.length >= 2) {
        console.log(`🚫 Room ${room.roomId} is full.`);
        return socket.emit("roomFull", "Room is already full.");
    }

    // Assign player symbol
    const symbols = ["X", "O"];
    const playerNumber = room.players.length + 1;
    const playerSymbol = symbols[playerNumber - 1];

    console.log(`🎭 Assigning symbol "${playerSymbol}" to Player ${playerNumber}`);

    // Add player to room
    room.players.push({
        name: playerName,
        userId,
        socketId: socket.id,
        amount,
        playerNumber,
        symbol: playerSymbol,
        expoPushToken
    });

    // Join the socket room
    socket.join(room.roomId);
    console.log(`✅ ${playerName} joined Room ${room.roomId} as Player ${playerNumber}`);

    // **NEW** - Emit event to inform the player they successfully joined
    socket.emit("roomJoined", { roomId: room.roomId, amount, players: room.players });

    // Notify others in the room
    socket.to(room.roomId).emit("playerJoined", { playerName, roomId: room.roomId });
    iooo.to(room.roomId).emit("playersUpdate", room.players);

    console.log(`🔄 Updated Room ${room.roomId} Players List:`, room.players);

    // If 2 players are present, start the game
    if (room.players.length === 2) {
       startGame(room)
        console.log(`🎮 Game in Room ${room.roomId} is READY!`);

        iooo.to(room.roomId).emit("gameReady", {
            players: room.players.map((p) => ({ name: p.name, symbol: p.symbol, amount: p.amount })),
            roomId: room.roomId,
            amount: room.amount,
        });

        room.currentPlayer = room.startingPlayer;
        iooo.to(room.roomId).emit("turnChange", room.currentPlayer);
    }
      // Notify players about whose turn it is
      iooo.to(roomId).emit('turnChange', room.currentPlayer);
        
      const firstPlayer = room.players[0]; // Retrieve the first player's info
  
      // Fetch first player's push token from the database
      const recipient = await OdinCircledbModel.findById(firstPlayer.userId); // Assuming `userId` matches DB _id
  

    if (recipient && recipient.expoPushToken) {

    // Notification details
    const notificationTitle = 'Game Ready!';
    const notificationBody = `${playerName} has joined. The game is ready to start!`;
    const notificationData = { roomId, playerName };

    // Send the push notification
    await sendPushNotification(
      recipient.expoPushToken,
      notificationTitle,
      notificationBody,
      notificationData
    );

    console.log('Push notification sent successfully to the first player.');
  } else {
    console.log('No valid Expo push token found for the first player.');
  }

          });



socket.on("checkRoom", ({ roomId }, callback) => {
    const roomExists = io.sockets.adapter.rooms.has(roomId);
    callback({ exists: roomExists });
});

socket.on("getRoomData", ({ userId }) => {
    const room = findRoomByUserId(userId); // Function to find user's room
    if (room) {
        io.to(socket.id).emit("roomData", { roomId: room.id, players: room.players });
    }
});

async function startGame(room) {
    console.log(`🎮 Starting ff game in Room ${room.roomId}...`);

    try {
        // Fetch both players from the database
        const player1 = await OdinCircledbModel.findById(room.players[0].userId);
        const player2 = await OdinCircledbModel.findById(room.players[1].userId);

        if (!player1 || !player2) {
            console.log("❌ Error: One or both players not found in the database.");
            io.to(room.roomId).emit("invalidGameStart", "Players not found");
            return;
        }

        // Check if both players have enough balance
        if (player1.wallet.balance < room.amount || player2.wallet.balance < room.amount) {
            console.log("❌ Error: One or both players have insufficient balance.");
            io.to(room.roomId).emit("invalidGameStart", "One or both players have insufficient balance");
            return;
        }

        // Deduct the balance from both players
        player1.wallet.balance -= room.amount;
        player2.wallet.balance -= room.amount;

        // Save the updated balances
        await player1.save();
        await player2.save();

        // Update total bet in the room
        room.totalBet = room.amount * 2;

        console.log(`💰 Balance deducted from both players. Total Bet: ${room.totalBet}`);

        // Emit updated balances to players
        io.to(player1.socketId).emit("balanceUpdated", { newBalance: player1.wallet.balance });
        io.to(player2.socketId).emit("balanceUpdated", { newBalance: player2.wallet.balance });

        // Emit game start event
       // io.to(room.roomId).emit("gameStart", { message: "Game is starting!", room });
    } catch (error) {
        console.error("❌ Error starting game:", error);
        io.to(room.roomId).emit("invalidGameStart", "Server error while starting the game");
    }
}

  
    socket.on('joinRoo', async ({ playerName, roomId, userId, totalBet, expoPushToken }) => {
    // Validate input
    if (!playerName || !userId || !roomId) {
      return socket.emit('invalidJoin', 'Player name, userId, and roomId are required');
    }

    // Check if the room exists
    let room = activeRooms[roomId];

    if (!room) {
      // Create a new room if it doesn't exist
      room = {
        roomId,
        players: [],
        board: Array(9).fill(null),
        currentPlayer: 0,
        startingPlayer: 0, // Track who starts
        player1Bet: null,
        player2Bet: null,
      };
      activeRooms[roomId] = room;
    }

    // Prevent more than 2 players from joining the same room
    if (room.players.length >= 2) {
      return socket.emit('roomFull', 'This room already has two players');
    }

    // Determine player number and symbol
    const playerNumber = room.players.length + 1;
    const playerSymbol = playerNumber === 1 ? 'X' : 'O';

        // Store bet amount for each player
if (playerNumber === 1) {
  room.player1Bet = totalBet;
} else if (playerNumber === 2) {
  room.player2Bet = totalBet;
}

    // Add the player to the room
    room.players.push({
      name: playerName,
      userId,
      socketId: socket.id,
      totalBet,
      playerNumber,
      symbol: playerSymbol,
      expoPushToken,
    });


    // Join the socket.io room
    socket.join(roomId);

    // Notify other players in the room about the new player
    socket.to(roomId).emit('playerJoined', `${playerName} joined the room`);

    // Send the current room state to the new player
    socket.emit('roomState', {
      player1Bet: room.player1Bet,
      player2Bet: room.player2Bet,
    });

        // Send individual player information to the player who joined
        socket.emit('playerInfo', {
          playerNumber: room.players.length,
          symbol: playerSymbol,
          playerName: playerName,
          roomId: room.roomId,
          userId: userId
        });
      
    // Emit the updated player list to everyone in the room
  iooo.to(roomId).emit('playersUpdate', {
  players: room.players,
  player1Bet: room.player1Bet,
  player2Bet: room.player2Bet,
});

    // Check if the room now has two players
    if (room.players.length === 2) {
      // Notify both players that the game is ready
      iooo.to(roomId).emit('twoPlayersJoined', {
        player1Name: room.players[0].name,
        player2Name: room.players[1].name,
        player1Symbol: room.players[0].symbol,
        player2Symbol: room.players[1].symbol,
        roomId,
      });

      room.currentPlayer = room.startingPlayer;

      // Notify players about whose turn it is
      iooo.to(roomId).emit('turnChange', room.currentPlayer);
        
      const firstPlayer = room.players[0]; // Retrieve the first player's info
  
      // Fetch first player's push token from the database
      const recipient = await OdinCircledbModel.findById(firstPlayer.userId); // Assuming `userId` matches DB _id
  

    if (recipient && recipient.expoPushToken) {

    // Notification details
    const notificationTitle = 'Game Ready!';
    const notificationBody = `${playerName} has joined. The game is ready to start!`;
    const notificationData = { roomId, playerName };

    // Send the push notification
    await sendPushNotification(
      recipient.expoPushToken,
      notificationTitle,
      notificationBody,
      notificationData
    );

    console.log('Push notification sent successfully to the first player.');
  } else {
    console.log('No valid Expo push token found for the first player.');
  }

    }
  })

          // Function to send push notifications
async function sendPushNotification(expoPushToken, title, body, data = {}) {
  try {
    // Validate if the token is a valid Expo push token
    if (!Expo.isExpoPushToken(expoPushToken)) {
      console.error(
        `Push token is not a valid Expo push token`
      );
      return;
    }

    // Create the notification payload
    const message = {
      to: expoPushToken,
      sound: 'default',
      title,
      body,
      data,
      icon: 'https://as1.ftcdn.net/v2/jpg/03/06/02/06/1000_F_306020649_Kx1nsIMTl9FKwF0jyYruImTY5zV6mnzw.jpg', // Include the icon if required
    };


    // Split messages into chunks for sending
    const chunks = expo.chunkPushNotifications([message]);
    const tickets = [];

    // Send the notification in chunks
    for (let chunk of chunks) {
      try {
        let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('Error sending push notification chunk:', error);
      }
    }

    console.log('Push notification tickets:');
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}


socket.on('sendMessage', ({ roomId, playerName, message }) => {
 
  iooo.to(roomId).emit('receiveMessage', { playerName, message });
});


 const startTurnTimer = (roomId) => {
  const room = activeRooms[roomId];

  if (!room) return;

  if (room.turnTimeout) {
    clearTimeout(room.turnTimeout); // Clear any existing timeout
  }

  // Set a new timeout
  room.turnTimeout = setTimeout(() => {
    console.log(`Player took too long. Auto-switching turn for room ${roomId}`);
    
    room.currentPlayer = (room.currentPlayer + 1) % 2; // Switch turn
    iooo.to(roomId).emit('turnChange', room.currentPlayer % 2);

    // Restart the timer for the next player
    startTurnTimer(roomId);
  }, 3000);
};
    
    



 socket.on('makeMove', async ({ roomId, index, playerName, symbol }) => {
  const room = activeRooms[roomId];

  // Check if room exists and has a players array
  if (!room || !Array.isArray(room.players)) {
    console.error(`Invalid room or players array for roomId: ${roomId}`);
    return socket.emit('invalidMove', 'Invalid game state');
  }

  // Initialize room.currentPlayer if necessary
  if (typeof room.currentPlayer !== 'number') {
    console.error(`Invalid currentPlayer for roomId: ${roomId}`);
    room.currentPlayer = 0; // Default to player 0
  }

  if (!room) {
    return socket.emit('invalidMove', 'Room not found');
  }

  const currentPlayerIndex = room.currentPlayer % 2;
  const currentPlayer = room.players[currentPlayerIndex];

  // Check if there's only one player in the room
  if (room.players.length < 2) {
    return socket.emit('invalidMove', 'Waiting for another player to join');
  }

  if (socket.id === currentPlayer.socketId) {
    if (room.board[index] === null) {
      room.board[index] = currentPlayer.symbol;
      
      // Move is made, clear the existing turn timeout
      if (room.turnTimeout) {
        clearTimeout(room.turnTimeout);
      }

      // Emit move made and turn change
      iooo.to(roomId).emit('moveMade', { index, symbol: currentPlayer.symbol, playerName: currentPlayer.name });

      // Change turn
      room.currentPlayer = (room.currentPlayer + 1) % 2;
      iooo.to(roomId).emit('turnChange', room.currentPlayer % 2);
     startTurnTimer(roomId); // Restart timer for next player

      // Start the turn timeout for the next player
      // room.turnTimeout = setTimeout(() => {
      //   console.log(`Player took too long. Auto-switching turn for room ${roomId}`);
      //   room.currentPlayer = (room.currentPlayer + 1) % 2;
      //   iooo.to(roomId).emit('turnChange', room.currentPlayer % 2);
      // }, 3000);
  
      // **Step 2: Start a new 5-second timer for forced turn change**
      // room.turnTimeout = setTimeout(() => {
      //   console.log(`Player took too long. Auto-switching turn for room ${roomId}`);
      //   room.currentPlayer = (room.currentPlayer + 1) % 2;
      //   iooo.to(roomId).emit('turnChange', room.currentPlayer % 2);
      // // }, 3000);

      const winnerSymbol = checkWin(room.board);
      if (winnerSymbol) {
        clearTimeout(room.turnTimeout); // **Stop turn timer if someone wins**
        
        const winnerPlayer = room.players.find(player => player.symbol === winnerSymbol);
        const loserPlayer = room.players.find(player => player.symbol !== winnerSymbol);
      
        if (winnerPlayer && loserPlayer) {
          const winnerUserId = winnerPlayer.userId;
          const loserUserId = loserPlayer.userId;
          const gameResult = `${winnerPlayer.name} (${winnerSymbol}) wins!`;

          // Access the totalBet from the room object
          const totalBet = room.totalBet;

          // Emit 'gameOver' event with winner and loser info
          // iooo.to(roomId).emit('gameOver', { 
          //   winnerSymbol, 
          //   result: gameResult, 
          //   totalBet, 
          //   winnerUserId, 
          //   winnerPlayer, 
          //   loserUserId, 
          //   loserPlayer 
          // });
             // Emit different events for winner and loser
  iooo.to(winnerPlayer.socketId).emit('winnerScreen', { 
    result: gameResult, 
    totalBet, 
    winnerUserId, 
    winnerPlayer 
  });

  iooo.to(loserPlayer.socketId).emit('loserScreen', { 
    result: gameResult, 
    totalBet, 
    loserUserId, 
    loserPlayer 
  });


          try {
            // Update the winner's balance in the database
            const winnerUser = await OdinCircledbModel.findById(winnerUserId);
            if (winnerUser) {
              winnerUser.wallet.cashoutbalance += totalBet;
              await winnerUser.save();

              // Save winner record
              const newWinner = new WinnerModel({
                roomId,
                winnerName: winnerUserId,
                totalBet: totalBet,
              });
              await newWinner.save();
              console.log('Winner saved to database:', newWinner);

              // Save loser record
              const newLoser = new LoserModel({
                roomId,
                loserName: loserUserId,
                totalBet: totalBet,
              });
              await newLoser.save();
              console.log('Loser saved to database:', newLoser);
            } else {
              console.error('Winner user not found');
            }
          } catch (error) {
            console.error('Error updating winner balance:', error);
          }
        }
      } else if (room.board.every((cell) => cell !== null)) {
        clearTimeout(room.turnTimeout); // **Stop timer on draw**

        // It's a draw
        iooo.to(roomId).emit('gameDraw', { 
          winnerSymbol: null, 
          result: "It's a draw!", 
          winnerUserId: null 
        });

        // Reset the game state for a new game
        room.board = Array(9).fill(null);
        room.startingPlayer = (room.startingPlayer + 1) % 2;
        room.currentPlayer = room.startingPlayer;

        iooo.to(roomId).emit('newGame', 
                             { message: "The game has been reset due to a draw. New game starting!",
                              startingPlayer: room.startingPlayer 
                             });
      }
    } else {
      return socket.emit('invalidMove', room.board[index] !== null ? 'Cell already occupied' : "It's not your turn");
    }
  }
});


  

socket.on('placeBe', async ({ roomId, userId, playerNumber, playerName, betAmount }) => {
  
   // Initialize room if it doesn't exist
   if (!activeRooms[roomId]) {
    activeRooms[roomId] = {
      player1Bet: 0,
      player2Bet: 0,
      player1UserId: null,
      player2UserId: null,
      totalBet: 0,
    };
  }

  const room = activeRooms[roomId]; // Safely reference the room object

  // Store the bet amount and user ID in variables based on player number
  let playerBet;
  let otherPlayerBet;
  let playerUserId;
  let otherPlayerUserId;

 // For Player 1
if (playerNumber === 1) {
  playerBet = betAmount;
  otherPlayerBet = activeRooms[roomId].player2Bet;
  playerUserId = userId;
  otherPlayerUserId = activeRooms[roomId].player2UserId;
  activeRooms[roomId].player1Bet = betAmount;
  activeRooms[roomId].player1UserId = userId;
  playerName = "Player 1";  // Replace with actual player's name, if available

// For Player 2
} else if (playerNumber === 2) {
  playerBet = betAmount;
  otherPlayerBet = activeRooms[roomId].player1Bet;
  playerUserId = userId;
  otherPlayerUserId = activeRooms[roomId].player1UserId;
  activeRooms[roomId].player2Bet = betAmount;
  activeRooms[roomId].player2UserId = userId;
  playerName = "Player 2";  // Replace with actual player's name, if available
}

// Save bet to BetCashModel
try {
  const betCash = new BetCashModel({
    roomId,
    playerName,  // Ensure playerName is valid
    betAmount,
  });
  await betCash.save();
} catch (error) {
  console.error('Error saving bets to BetCashModel:', error.message);
}

  // Check if both players have placed their bets

  const { player1Bet, player2Bet, player1UserId, player2UserId } = room;

  if (player1Bet > 0 && player2Bet > 0) {
    const totalBet = player1Bet + player2Bet;

    // Store the totalBet in the room object
    room.totalBet = totalBet;

    // Emit 'betPlaced' event to all clients in the room with updated bet information
    iooo.to(roomId).emit('betPlaced', { 
      player1UserId, 
      player1Bet, 
      player2UserId, 
      player2Bet, 
      totalBet,
    });

    // Check if player1Bet equals player2Bet
    if (player1Bet === player2Bet) {
      // Emit 'equalBet' event if the bets are equal
      iooo.to(roomId).emit('equalBet', { 
        player1UserId, 
        player1Bet, 
        player2UserId, 
        player2Bet 
      });

      // Deduct the bet amount from the user's balance in the database
      try {
        // Deduct the bet amount from the player's balance
        const playerUser = await OdinCircledbModel.findById(playerUserId);
        const otherPlayerUser = await OdinCircledbModel.findById(otherPlayerUserId);

        if (!playerUser || !otherPlayerUser) {
          throw new Error('User not found');
        }

        playerUser.wallet.balance -= playerBet;
        otherPlayerUser.wallet.balance -= otherPlayerBet;

        await Promise.all([playerUser.save(), otherPlayerUser.save()]);
      } catch (error) {
        console.error('Error deducting bet amount from user balance:', error.message);
      }
    } else {
      // If the bets are not equal, notify the clients and reset the bet amounts
      iooo.to(roomId).emit('unequalBet', {
        player1UserId,
        player1Bet,
        player2UserId,
        player2Bet,
      });

      // Reset the bet amounts and user IDs
      room.player1Bet = 0;
      room.player2Bet = 0;
    }
  }
});


//   socket.on('disconnect', async () => {
//   console.log('User disconnected');

//   // Find the room where the player has disconnected
//   const roomId = Object.keys(activeRooms).find(roomId => {
//     const room = activeRooms[roomId];
//     return room && Array.isArray(room.players) && room.players.some(player => player.socketId === socket.id);
//   });

//   if (roomId) {
//     console.log(`Player disconnected from room ${roomId}`);

//     const room = activeRooms[roomId];

//     // Find the disconnected player
//     const disconnectedPlayer = room.players.find(player => player.socketId === socket.id);
    
//     // Remove the disconnected player
//     room.players = room.players.filter(player => player.socketId !== socket.id);

//     // **Check if a winner was already declared using checkWin**
//     const winnerSymbol = checkWin(room.board);
//     if (winnerSymbol) {
//       console.log(`Game already has a winner (${winnerSymbol}) in room ${roomId}. No further rewards given.`);
//       return;
//     }

//     if (room.players.length === 0) {
//       // No players left, delete the room
//       delete activeRooms[roomId];

//       try {
//         const result = await BetModel.deleteOne({ roomId });
//         if (result.deletedCount > 0) {
//           console.log(`Room ${roomId} successfully deleted from the database.`);
//         } else {
//           console.warn(`Room ${roomId} not found in the database.`);
//         }
//       } catch (err) {
//         console.error(`Error deleting room ${roomId} from the database:`, err);
//       }
//     } else {
//       // **If the game was unfinished, award the remaining player as the winner**
//       const remainingPlayer = room.players[0]; // Only one player remains
//       const winnerUserId = remainingPlayer.userId;
//       const totalBet = room.totalBet;

//       console.log(`Remaining player ${remainingPlayer.name} wins by default due to opponent disconnection.`);

//       // Declare winner
//       iooo.to(roomId).emit('gameOver', {
//         winnerSymbol: remainingPlayer.symbol,
//         result: `${remainingPlayer.name} wins by opponent disconnection!`,
//         totalBet,
//         winnerUserId,
//         winnerPlayer: remainingPlayer,
//         loserUserId: disconnectedPlayer.userId,
//         loserPlayer: disconnectedPlayer
//       });

//       try {
//         // Update the winner's balance in the database
//         const winnerUser = await OdinCircledbModel.findById(winnerUserId);
//         if (winnerUser) {
//           winnerUser.wallet.cashoutbalance += totalBet;
//           await winnerUser.save();

//           // Save winner record
//           const newWinner = new WinnerModel({
//             roomId,
//             winnerName: winnerUserId,
//             totalBet: totalBet,
//           });
//           await newWinner.save();
//           console.log('Winner saved to database:', newWinner);

//           // Save loser record
//           const newLoser = new LoserModel({
//             roomId,
//             loserName: disconnectedPlayer.userId,
//             totalBet: totalBet,
//           });
//           await newLoser.save();
//           console.log('Loser saved to database:', newLoser);
//         } else {
//           console.error('Winner user not found in database');
//         }
//       } catch (error) {
//         console.error('Error updating winner balance:', error);
//       }
//     }
//   }
// });



socket.on('disconnect', async () => {
  console.log(`User ${socket.id} disconnected`);

  // Find the room where the player was active
  const roomId = Object.keys(activeRooms).find(roomId => {
    const room = activeRooms[roomId];
    return room && Array.isArray(room.players) && room.players.some(player => player.socketId === socket.id);
  });

  if (!roomId) return; // If no room found, exit

  console.log(`Player disconnected from room ${roomId}`);
  const room = activeRooms[roomId];

  // Find and remove the disconnected player
  const disconnectedPlayer = room.players.find(player => player.socketId === socket.id);
  room.players = room.players.filter(player => player.socketId !== socket.id);

  // If the game already has a winner, do nothing
  const winnerSymbol = checkWin(room.board);
  if (winnerSymbol) {
    console.log(`Game in room ${roomId} already has a winner (${winnerSymbol}). No further actions.`);
    return;
  }

  if (room.players.length === 0) {
    // No players left, delete room data
    delete activeRooms[roomId];
    console.log(`Room ${roomId} deleted from memory.`);

    try {
      const result = await BetModel.deleteOne({ roomId });
      if (result.deletedCount > 0) {
        console.log(`Room ${roomId} deleted from database.`);
      } else {
        console.warn(`Room ${roomId} not found in database.`);
      }
    } catch (err) {
      console.error(`Error deleting room ${roomId} from database:`, err);
    }
  } else {
    // Award the remaining player as the winner
    const remainingPlayer = room.players[0]; // The only remaining player
    const winnerUserId = remainingPlayer.userId;
    const totalBet = room.totalBet;

    console.log(`Remaining player ${remainingPlayer.name} wins by default.`);

    iooo.to(roomId).emit('gameOver', {
      winnerSymbol: remainingPlayer.symbol,
      result: `${remainingPlayer.name} wins by opponent disconnection!`,
      totalBet,
      winnerUserId,
      winnerPlayer: remainingPlayer,
      loserUserId: disconnectedPlayer.userId,
      loserPlayer: disconnectedPlayer
    });

    try {
      // Update the winner's wallet balance
      const winnerUser = await OdinCircledbModel.findById(winnerUserId);
      if (winnerUser) {
        winnerUser.wallet.cashoutbalance += totalBet;
        await winnerUser.save();

        // Save winner & loser records
        await WinnerModel.create({
          roomId,
          winnerName: winnerUserId,
          totalBet
        });

        await LoserModel.create({
          roomId,
          loserName: disconnectedPlayer.userId,
          totalBet
        });

        console.log(`Winner ${winnerUserId} and loser ${disconnectedPlayer.userId} saved in database.`);
      } else {
        console.error(`Winner user ${winnerUserId} not found in database.`);
      }
    } catch (error) {
      console.error('Error updating winner balance:', error);
    }
  }

  // Clean up the socket reference
  socket.removeAllListeners();
});


   
      function checkWin(board) {
        // Validate board
        if (!Array.isArray(board) || board.length !== 9) {
          console.error('Invalid game board:', board);
          return null; // Return null or throw an error
        }
      
        const winPatterns = [
          [0, 1, 2],
          [3, 4, 5],
          [6, 7, 8],
          [0, 3, 6],
          [1, 4, 7],
          [2, 5, 8],
          [0, 4, 8],
          [2, 4, 6],
        ];
      
        for (const condition of winPatterns) {
          const [a, b, c] = condition;
          if (board[a] && board[a] === board[b] && board[b] === board[c]) {
            return board[a]; // Return the winning symbol
          }
        }
      
        // Check for a draw (all cells are filled)
        if (board.every(cell => cell !== null)) {
          return null; // It's a draw
        }
      
        return null; // No winner yet
      }


      function generateRoomId() {
        return Math.random().toString(36).substr(2, 9); // Generate a random alphanumeric string
      }

}

    )}

module.exports = startSocketServer1;
