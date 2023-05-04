const nodemailer = require("nodemailer");
const hbs = require('nodemailer-express-handlebars');
const path = require('path');

const mail = async (_to, _subject, _template, _context) => {
    let transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_PORT,
        auth: {
            user: process.env.SMTP_LOGIN,
            pass: process.env.SMTP_PASSWORD,
        },
        connectionTimeout: 10000
    });

    const TEMPLATE_CATALOG = `./${process.env.EMAIL_TEMPLATE_CATALOG}/`;
    const handlebarOptions = {
        viewEngine: {
            partialsDir: path.resolve(TEMPLATE_CATALOG),
            defaultLayout: false,
        },
        viewPath: path.resolve(TEMPLATE_CATALOG),
    };

    // use a template file with nodemailer
    transporter.use('compile', hbs(handlebarOptions))

    let mailParams = {
        from: process.env.SMTP_FROM,
        to: _to,
        subject: _subject,
        template: _template, // the name of the template file i.e email.handlebars
        context: _context
    };

    let info = await transporter.sendMail(mailParams);
    console.log("Message sent: %s", info.messageId);
    return info;
}
module.exports = { mail }