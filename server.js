const app = require("./app")
const dotenv = require("dotenv")
const mongoose = require("mongoose")
const path = require("path")

const { Server } = require("socket.io")


process.on("uncaughtException", (err) => {
    console.log("uncaughtException", err)
    process.exit(1)
});

dotenv.config({ path: "./config.env" })

const http = require("http")
const User = require("./models/user");
const FriendRequest = require("./models/friendRequest");
const OneToOneMessage = require("./models/OneToOneMessage")
const server = http.createServer(app)

const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
})

const DB = process.env.DBURI.replace("<password>", process.env.DBPASSWORD)

// mongoose.connect(DB,{
//         useNewUrlParser: true,
//         useCreateIndex: true,
//         useFindAndModify: false,
//         useUnifiedTopology: true
// }).then(con => console.log("DB Success", con)).catch(e => console.log("DB Error", e))

mongoose.connect(DB).then(() => console.log("db connected")).catch(err => console.log("DB connection Error", err))

const port = process.env.PORT || 8000

server.listen(port, () => {
    console.log(`App started running on port ${port}...`)
})

io.on("connection", async (socket) => {
    const user_id = socket.handshake.query["user_id"];

    const socket_id = socket.id;
    console.log(`User Connected ${socket_id}`)


    if (user_id !== null && Boolean(user_id)) {
        await User.findByIdAndUpdate(user_id, { socket_id, status: "Online" })
        socket.broadcast.emit("is_online", { user_id: user_id })
    }

    socket.on("friend_request", async (data) => {

        const to_user = await User.findById(data.to).select("socket_id");
        const from_user = await User.findById(data.from).select("socket_id");

        await FriendRequest.create({
            sender: data.from,
            recipient: data.to
        })

        // TODO => Create a friend request

        // emit event => "new_friend_request"
        io.to(to_user.socket_id).emit("new_friend_request", {
            // 
            message: "New Friend Request Recieved"
        })

        // emit event => "request_sent"

        io.to(from_user.socket_id).emit("request_sent", {
            message: "Request sent successfully!"
        })

    });

    socket.on("accept_request", async (data) => {
        const request_doc = await FriendRequest.findById(data.request_id)

        const sender = await User.findById(request_doc.sender);
        const receiver = await User.findById(request_doc.recipient);

        sender.friends.push(request_doc.recipient)
        receiver.friends.push(request_doc.sender)

        await receiver.save({ new: true, validateModifiedOnly: true })
        await sender.save({ new: true, validateModifiedOnly: true })


        await FriendRequest.findByIdAndDelete(data.request_id);

        io.to(sender.socket_id).emit("request_accepted", {
            message: "Friend Request Accepted"
        })
        io.to(receiver.socket_id).emit("request_accepted", {
            message: "Friend Request Accepted"
        });
    });


    socket.on("get_direct_conversations", async ({ user_id }, callback) => {

        const existing_conversations = await OneToOneMessage.find({        // returns an array of chats list with whom user has previously chat with
            participants: { $all: [user_id] }
        }).populate("participants", "firstName lastName email _id status");

        callback(existing_conversations)

    })


    socket.on("start_conversation", async (data) => {
        // data: {to, from}
        const { to, from } = data;
        // check if ther si any existing conversation between these users

        const existing_conversation = await OneToOneMessage.find({
            participants: { $size: 2, $all: [to, from] }
        }).populate("participants", "firstName lastName email _id status");

        // if no existing_conversation

        if (existing_conversation.length === 0) {
            let new_chat = await OneToOneMessage.create({
                participants: [to, from],
            });

            new_chat = await OneToOneMessage.findById(new_chat._id).populate("participants", "firstName lastName email _id status");
            socket.emit("start_chat", new_chat);
        }
        // if there is existing_conversations
        else {
            socket.emit("start_chat", existing_conversation[0]);
        }


    })

    // Hanlde text/link messages

    socket.on("get_messages", async (data, callback) => {
        const { messages } = await OneToOneMessage.findById(data.conversation_id).select("messages");
        callback(messages)
    })

    socket.on("text_message", async (data) => {

        // data : {to, from, text, conversation_id, type }

        const { to, from, message, conversation_id, type } = data;
        const to_user = await User.findById(to);
        const from_user = await User.findById(from);

        const new_message = {
            to, from, type, text: message, created_at: Date.now()
        }

        // create a new conversation if it doesn't exist yet or add new message to the messages list
        const chat = await OneToOneMessage.findById(conversation_id);
        chat.messages.push(new_message)

        // save to db
        await chat.save({})

        // emit  new_message -> to user
        io.to(to_user.socket_id).emit("new_message", {
            conversation_id,
            message: new_message
        })

        // emit new_message -> from user
        io.to(from_user.socket_id).emit("new_message", {
            conversation_id,
            message: new_message
        })

    });

    socket.on("file_message", (data) => {

        // data:{to, form, text, file}

        // get the file extension

        const fileExtension = path.extname(data.file.name);

        // generate a unique filename

        const fileName = `${Date.now()}_${Math.floor(Math.random() * 10000)}${fileExtension}`;

        // upload file to AWS S3 

        // create a new conversation if it doesn't exist yet or add new message to the messages list

        // save to db

        // emit incoming _message -> to user

        // emit outgoing_message -> from user



    })


    socket.on("end", async (data) => {
        // Find user by _id and set the status to Offline
        if (data.user_id) {
            await User.findByIdAndUpdate(data.user_id, { status: "Offline" })
        }

        // TODO => broadcast user_disconnected


        console.log("Closing connection");

        socket.disconnect(0);
    });

})

process.on("unhandledRejection", (err) => {
    console.log("unhandledRejection", err)
    server.close(() => process.exit(1))
})