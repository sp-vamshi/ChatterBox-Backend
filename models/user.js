const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")
const crypto = require("crypto")


const userSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: [true, "First Name is required"],
    },
    lastName: {
        type: String,
        // required: [true, "Last Name is required"]
    },
    avatar: {
        type: String,
    },
    email: {
        type: String,
        required: [true, "Email is required"],
        validate: {
            validator: function (email) {
                return String(email).toLocaleLowerCase().match(
                    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
                )
            },
            message: (props) => `Email (${props.value}) is invalid!`
        }
    },
    password: {
        type: String,
    },
    confirmPassword: {
        type: String
    },
    passwordChangedAt: {
        type: Date,
    },
    passwordResetToken: {
        type: String,
    },
    passwordResetExpires: {
        type: Date,
    },
    createdAt: {
        type: Date,
    },
    updatedAt: {
        type: Date
    },
    verified: {
        type: Boolean,
        default: false
    },
    otp: {
        type: String,

    },
    otp_expiry_time: {
        type: Date,

    },
    socket_id: {
        type: String,
    },
    friends: [
        {
            type: mongoose.Schema.ObjectId,
            ref: "User"
        }
    ],
    status: {
        type: String,
        enum: ["Online", "Offline"]
    }

});


// Middleware function which will be called before saving otp

// OTP pre-Hook
userSchema.pre("save", async function (next) {
    // encrypt before saving otp
    // Only run this function if OTP is actually modified
    // Hash the OTP with the cost of 12

    if (!this.isModified("otp") || !this.otp) return next();

    this.otp = await bcrypt.hash(this.otp.toString(), 12);

    return next();
});

// Password pre-Hook
userSchema.pre("save", async function (next) {
    // encrypt before saving password
    // Only run this function if password is actually modified
    // Hash the password with the cost of 12

    if (!this.isModified("password")) return next();

    this.password = await bcrypt.hash(this.password, 12);

    return next();
});



// Methods for UserSchema
userSchema.methods.correctPassword = async function (
    candidatePassword, // Password sent through request
    userPassword // Encrypted password stored in DB
) {
    return await bcrypt.compare(candidatePassword, userPassword)
}

userSchema.methods.correctOTP = async function (
    candidateOTP, // OTP sent throught request
    userOTP // Encrypted OTP stored in DB 
) {

    return await bcrypt.compare(candidateOTP, userOTP)
}

userSchema.methods.createPasswordResetToken = function () {

    // Generate random password reset token string of hex format
    const resetToken = crypto.randomBytes(32).toString("hex")

    // Hash the reset token string with sha256 alogorithm and pass reset token string to update method 
    // and provide format used while creating that reset token string.
    this.passwordResetToken = crypto.createHash("sha256").update(resetToken).digest("hex")

    this.passwordResetExpires = Date.now() + 10 * 60 * 1000

    return resetToken

}

userSchema.methods.changedPasswordAfter = function (timestamp) {
    return timestamp < this.passwordChangedAt
}

const User = new mongoose.model("User", userSchema);
module.exports = User;