const nodeMailer = require("nodemailer")

const dotenv = require("dotenv")
dotenv.config({ path: "../config.env" })


const sendMail = async ({ to, subject, html, attachments }) => {

    const options = {
        from: "developer.vamshi11@gmail.com",
        to: to,
        subject: subject,
        html: html,
        attachments
    }

    try {
        let transporter = nodeMailer.createTransport({
            service: 'gmail',
            host: "smtp.example.com",
            port: 587,
            auth: {
                user: process.env.SENDER_MAIL,
                pass: process.env.SENDER_KEY
            },
            tls: {
                // do not fail on invalid certs
                rejectUnauthorized: false,
            },
        })

        const response = await transporter.sendMail(options)
        return response


    } catch (error) {
        return error
    }

}

exports.sendEmail = async (args) => {
    // if (process.env.NODE_ENV === "development") {
    //     return new Promise.resolve();

    // } else {

    //     return sendSGMail(args);

    // }
    return sendMail(args);
}