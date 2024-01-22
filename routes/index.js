const router = require("express").Router();

const authRoute = require("./authRoutes")
const userRoute = require("./userRoutes")

router.use("/auth", authRoute)
router.use("/user", userRoute)

module.exports = router;