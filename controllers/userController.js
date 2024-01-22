const filterObj = require("../Utils/filterObj");
const FriendRequest = require("../models/friendRequest");
const UserModel = require("../models/user")

exports.updateMe = async (req, res, next) => {
    const { user } = req

    const filteredBody = filterObj(req.body, "firstname", "lastName", "about", "avatar");

    const updated_user = await UserModel.findByIdAndUpdate(user._id, filteredBody, { new: true, validateModifiedOnly: true })

    res.status(200).json({
        status: "success",
        data: updated_user,
        message: "Profile Updated Successfully!"
    })

}


exports.getUsers = async (req, res, next) => {
    const all_users = await UserModel.find({
        verified: true,
    }).select("firstName lastName _id");


    const this_user = req.user;

    const remaining_users = all_users.filter(
        (user) => !this_user.friends.includes(user._id) &&
            user._id.toString() !== req.user._id.toString()
    )

    res.status(200).json({
        status: "success",
        data: remaining_users,
        message: "Users found successfully!"
    })

}


exports.getFriendRequests = async (req, res, next) => {
    const requests = await FriendRequest.find({ recipient: req.user._id }).populate("sender", "_id firstName lastName")
    res.status(200).json({
        status: "success",
        data: requests,
        message: "Friend requests found successfully!"
    })
}


exports.getFriends = async (req, res, next) => {
    const this_user = await UserModel.findById(req.user._id).populate("friends", "_id firstName lastName")

    res.status(200).json({
        status: "success",
        data: this_user.friends,
        message: "Friends found successfully!"
    })

}