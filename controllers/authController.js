const jwt = require("jsonwebtoken");
const otpGenerator = require("otp-generator");
const mailService = require("../services/mailer");
const crypto = require("crypto");

const filterObj = require("../Utils/filterObj");
const User = require("../models/user");
const { promisify } = require("util");

const otp = require("../Templates/otp");
const resetPassword = require("../Templates/resetPassword");

const signToken = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET);

exports.register = async (req, res, next) => {
  const { email } = req.body;

  const filteredBody = filterObj(req.body, "firstName", "lastName", "password", "email");

  // Check if a verified user with givern email exists

  const existing_user = await User.findOne({ email: email });

  if (existing_user && existing_user.verified) {
    return res.status(400).json({
      status: "error",
      message: "Email is already in use, Please login.",
    });
  } else if (existing_user) {
    // if not verfied then update prev one

    await User.findOne({ email: email });

    // generates OTP and send email to user
    req.userId = existing_user._id;
    req.emailAleadyExists = true;

    next();
  } else {
    // if user record is not available in DB

    const new_user = await User.create(filteredBody);

    // generate OTP and send email to user
    req.userId = new_user._id;
    next();
  }
};

exports.sendOTP = async (req, res, next) => {
  const { userId, emailAleadyExists } = req;

  const new_otp = otpGenerator.generate(6, { upperCaseAlphabets: false, lowerCaseAlphabets: false, specialChars: false });

  const otp_expiry_time = Date.now() + 10 * 60 * 1000; //10 mins after oTP is sent

  const user = await User.findByIdAndUpdate(userId, {
    otp_expiry_time: otp_expiry_time,
  });

  user.otp = new_otp.toString();

  await user.save({ new: true, validateModifiedOnly: true });

  // Send OTP Mail to user

  mailService.sendEmail({
    to: user.email,
    subject: "Verification OTP",
    html: otp(user.firstName, new_otp),
    attachments: [],
  });

  console.log(new_otp);

  if (emailAleadyExists) {
    res.status(200).json({
      status: "success",
      message: "Email already exists! Please verify with OTP sent to your Email",
    });
  } else {
    res.status(200).json({
      status: "success",
      message: "Please verify with OTP sent to your Email",
    });
  }
};

exports.verifyEmail = async (req, res, next) => {
  // verify OTP and user record accordingly
  const { email, otp } = req.body;

  const user = await User.findOne({
    email,
    otp_expiry_time: { $gt: Date.now() },
  });

  // if email is not found or OTP is incorrect
  if (!user) {
    return res.status(400).json({
      status: "error",
      message: "Email is invalid or OTP expired",
    });
  }

  if (user?.verified) {
    return res.status(400).json({
      status: "error",
      message: "Email is already verified",
    });
  }

  // if OTP is incorrect
  if (!(await user?.correctOTP(otp, user.otp))) {
    return res.status(400).json({
      status: "error",
      message: "OTP is incorrect",
    });
  }

  // If OTP is correct

  user.verified = true;
  user.otp = undefined;

  await user.save({ new: true, validateModifiedOnly: true });

  const token = signToken(user._id);

  res.status(200).json({
    status: "success",
    message: "OTP verified successfully!",
    token,
    user_id: user._id,
  });
};

exports.login = async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      status: "error",
      message: "Both email and password are required",
    });
  }

  const userDoc = await User.findOne({ email: email }).select("+password");

  if (!userDoc || !(await userDoc.correctPassword(password, userDoc.password))) {
    return res.status(400).json({
      status: "error",
      message: "Email or password is incorrect",
    });
  }

  const token = signToken(userDoc._id);

  return res.status(200).json({
    status: "success",
    message: "Logged in successfully",
    token,
    user_id: userDoc._id,
  });
};

exports.protect = async (req, res, next) => {
  // 1. Getting token (JWT) and check if it's there.

  let token;

  // if(req.headers.authorization && req.headers.authorization?.startsWith("Bearer"))

  if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  } else {
    res.status(401).json({
      status: "error",
      message: "You are not logged in! Please login to get access.",
    });
    return;
  }

  // 2. Verification of Token

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3. Check if user still exists

  const this_user = await User.findById(decoded.userId);
  if (!this_user) {
    return res.status(401).json({
      status: "error",
      message: "The user belonging to this token no longer exists.",
    });
  }

  // 4. Check if user changed password after token was issued

  if (this_user.changedPasswordAfter(decoded.iat)) {
    return res.status(401).json({
      status: "error",
      message: "User recently updated password! Please log in again.",
    });
  }

  req.user = this_user;
  next();
};

exports.forgotPassword = async (req, res, next) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  // 1. check if user exists with given mail
  if (!user) {
    return res.status(404).json({
      status: "error",
      message: "There is no user with given email address.",
    });
  }

  // 2. Generate the random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  try {
    const resetURL = `${process.env.CLIENT_ORIGIN_URL}/auth/new-password?token=${resetToken}`;

    // Send Email With Reset URL

    mailService.sendEmail({
      to: user.email,
      subject: "Forgot Password",
      html: resetPassword(user.firstName, resetURL),
      attachments: [],
    });
    console.log(resetURL);

    res.status(200).json({
      status: "success",
      message: "Reset Password link sent to Email.",
    });
  } catch (error) {
    // clear the token saved if any error
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    res.status(500).json({
      status: "error",
      message: "There was an error sending the email, Please try again later.",
    });
  }
};

exports.resetPassword = async (req, res, next) => {
  const { password, confirmPassword } = req.body;

  // 1. convert token to hashed token to compare with password reset token which is shared in Db
  const hashedToken = crypto.createHash("sha256").update(req.body.token).digest("hex");

  // 2. Get user based on converted token along with the time of submission
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  // 3. return error if user manipulated token or submission is out of time window.
  if (!user) {
    return res.status(400).json({
      status: "error",
      message: "Token is Invalid or Expired",
    });
  }

  // 3. Update user's password and set resetToken & expiry to undefined

  user.password = password;
  user.confirmPassword = confirmPassword;

  user.passwordResetToken = undefined;
  user.confirmPassword = undefined;
  user.passwordResetExpires = undefined;

  await user.save();

  // 4. Log in the user and Send new JWT

  // TODO => sned an email to user informing about password reset

  const token = signToken(user._id);

  res.status(200).json({
    status: "success",
    message: "Password Reset Successfully",
    token,
  });
};

exports.googleLogin = async (req, res, next) => {
  const { email } = req.body;
//if user is already in the DB we will login the user in try block
// else we will store the data we get from the frontend and store the data in the DB and login the user
  try {
    const user = await User.findOne({ email: email });
    if (user) {
      const token = signToken(user._id);
      //   const { password: pass, ...rest } = user._doc;
      res.status(200).json({
        status: "success",
        message: "Loggedin successfully!",
        token,
        user_id: user._id,
      });
    } else {
      const generatedPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);

      const userObj = { ...req.body, password: generatedPassword };
      const filteredBody = filterObj(userObj, "firstName", "lastName", "password", "email");
      const newUser = await User.create({...filteredBody,verified:true});
      const token = signToken(newUser._id);
      //   const { password: pass, ...rest } = user._doc;
      res.status(200).json({
        status: "success",
        message: "Loggedin successfully!",
        token,
        user_id: newUser._id,
      });
    }
  } catch (error) {
    next(error);
  }
};
