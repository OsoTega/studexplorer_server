import express from 'express';
import * as dotenv from 'dotenv';
import bodyParser from 'body-parser';
import cors from 'cors';
import bcrypt from 'bcrypt';
import webpush from "web-push";
import http from 'http';
import { Server } from 'socket.io';
import crypto from 'crypto';
import translate from "@iamtraction/google-translate";

dotenv.config();

const vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
  };

  webpush.setVapidDetails(
    "test@gmail.com",
    vapidKeys.publicKey,
    vapidKeys.privateKey
  )

const translateText = async (text: string, fromLanguage = "auto", targetLanguage: string) => {
    try {
        // Translate the text to the target language
        const translatedText = await translate(text, {
            from: fromLanguage, // Automatically detect the source language
            to: targetLanguage,
        });

        //console.log(`Original text: ${text}`);
        //console.log(`Translated text (${targetLanguage}): ${translatedText.text}`);
        return translatedText.text;
    } catch (error) {
        console.error('Error:', error.message);
        throw error;
    }
}

dotenv.config();

const app = express();

app.use(express.json({ limit: "50mb" }))
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ["GET", "POST"]
    }
});

const waitingRooms = [];
const activeRooms = [];

const findAvailableUser = (rooms: string[])=>{
    let index = -1;
    if(waitingRooms.length > 0){
        index = Math.floor(Math.random() * (waitingRooms.length-1));
    }
    // for(let i = 0; i < activeRooms.length; i++){
    //     if(activeRooms[i].active === false && !rooms.includes(activeRooms[i].room) && activeRooms[i].users.length < 2){
    //         index = i;
    //         break;
    //     }
    // }
    //if(rooms.includes(waitingRooms[index].room)) return -1;

    return index;
}

app.post("/create-room", (req, res)=>{
    const data = req.body;
    if(waitingRooms.length === 0){
        const roomId = crypto.randomBytes(16).toString("hex");
        waitingRooms.push({
            users: [{language: data.language, id: data.id}],
            room: roomId,
            active: false
        });
        res.send(JSON.stringify({roomId, active: false}));
    }else{
        const index = findAvailableUser(data.rooms);
        if(index < 0){
            const roomId = crypto.randomBytes(16).toString("hex");
            waitingRooms.push({
                users: [{language: data.language, id: data.id}],
                room: roomId,
                active: false
            });
            res.send(JSON.stringify({roomId, active: false}));
        }else{
            const chatRoom = waitingRooms[index];
            waitingRooms.splice(index, 1);
            chatRoom.users.push({language: data.language, id: data.id});
            chatRoom.active = true;
            activeRooms.push(chatRoom);
            res.send(JSON.stringify({roomId: chatRoom.room, active: true}));
        }
    }
})

app.post("/leave-room", (req, res)=>{
    const data = req.body;
    try{
        let index = -1;
        for(let i = 0; i < activeRooms.length; i++){
            if(activeRooms[i].room === data.room){
                index = i;
                break;
            }
        }
        if(index < 0) return;

        activeRooms[index].active = false;
        let index2 = -1;
        //@ts-ignore
        for(let i = 0; i < activeRooms[index].users.length; i++){
            if((activeRooms[index].users[i].language === data.language) && (activeRooms[index].users[i].id === data.id)){
                index2 = i;
                break;
            }
        }
        activeRooms[index].users.splice(index2, 1);
        const chatRoom = activeRooms[index];
        waitingRooms.push(chatRoom);
        activeRooms.splice(index, 1);
        res.send(JSON.stringify({success: true}))
    }catch(e){
        res.send(JSON.stringify({success: false}))
    }
})

io.on("connection", (socket)=>{
    //socket.id

    socket.on("join_room", (data)=>{
        socket.join(data);
        socket.broadcast.emit("joined_chat", data)
    })

    socket.on("disconnect", (data) => {
        for(let i = 0; i < activeRooms.length; i++){
            if(activeRooms[i].users.length < 2){
                socket.broadcast.emit("user_left_chat", activeRooms[i].room);
            }
        }
    });

    socket.on("leave_room", (data)=>{
        socket.leave(data);
        socket.broadcast.emit("left_chat", data)
    })

    socket.on("typing", (data)=>{
        socket.to(data.room).emit("user_typing", "typing");
    })

    socket.on("not_typing", (data)=>{
        socket.to(data.room).emit("user_not_typing", "typing");
    })

    socket.on("send_message", async (data)=>{
        //socket.broadcast.emit("receive_message", data)
        const room = data.room;
        const message = data.message;
        const language = data.language;
        
        let sendLanguage = 'en';

        for(let i = 0; i < activeRooms.length; i++){
            if(activeRooms[i].room === room){
                if(activeRooms[i].users[0].language === language){
                    sendLanguage = activeRooms[i].users[1].language;
                }else{
                    sendLanguage = activeRooms[i].users[0].language;
                }
                break;
            }
        }

        if(sendLanguage === language){
           socket.to(data.room).emit("receive_message", message)
        }else{
            let responseMessage = await translateText(message, language, sendLanguage)
            socket.to(data.room).emit("receive_message", responseMessage)
        }
    })
})


server.listen(8080);