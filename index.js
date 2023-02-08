const express = require('express');
const cors = require('cors');
require('dotenv').config();
const https = require('https');
const fs = require('fs');

const { DateTime } = require("luxon");

const mailService = require('./mailService');

const TelegramBot = require('node-telegram-bot-api');

const ExcelJS = require('exceljs');
const filePath = process.env.MENU_FILE_PATH;
const worksheetName = process.env.MENU_WORKSHEET_NAME;

const token = process.env.TELEGRAM_BOT_TOKEN;

const bot = new TelegramBot(token, { polling: true });
const webAppURL = process.env.WEBAPP_URL;

const app = express();

app.use(express.json());
app.use(cors());


bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    console.log(msg);

    if (text === '/start') {
        await bot.sendMessage(chatId, 'Посмотреть меню', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Смотреть", web_app: { url: webAppURL } }]
                ]
            }
        });
    }
});


app.get('/menu', async (req, res) => {

    let menuName = "";
    let menuMeals = [];

    try {
        const workbook = new ExcelJS.Workbook();
        const wb = await workbook.xlsx.readFile(filePath);
        const ws = wb.getWorksheet(worksheetName);
        ws.eachRow(function (row, rowNumber) {
            const rowValues = row.values;
            if (rowNumber == 1) {
                menuName = rowValues[1] + " " + DateTime.fromJSDate(rowValues[2]).toFormat("dd.LL.y");
            }
            if (rowNumber >= 4) {
                menuMeals.push({
                    name: rowValues[1],
                    price: rowValues[2]
                });
            }
        });

        const menu = {
            "name": menuName,
            "meals": menuMeals
        };
        res.status(200).json(menu);
    } catch (e) {
        console.log("Error parse menu", e);
        res.status(500).json({ "errorName": e.name, "errorMessage": e.message });
    }
});

app.post('/order', async (req, res) => {

    const data = req.body;

    try {
        const subject = process.env.ADMIN_EMAIL_SUBJECT;
        const emailTemplateName = process.env.ADMIN_EMAIL_TEMPLATE;
        data.delivery.paymentString = data.delivery.payment == 'cash' ? "Наличные" : "Онлайн";
        mailService.mail(data.delivery.email, subject, emailTemplateName, data).catch(console.error);
        res.status(200).json({});
    } catch (e) {
        console.log("Error save order", e);
        res.status(500).json({ "errorName": e.name, "errorMessage": e.message });
    }
});

const PORT = process.env.SERVER_PORT;
if(process.env.SERVER_KEY_PATH.length > 0){
    https
    .createServer(
      {
        key: fs.readFileSync(process.env.SERVER_KEY_PATH),
        cert: fs.readFileSync(process.env.SERVER_CERT_PATH),
      },
      app
    )
    .listen(PORT, function () {
      console.log(`Server listens https://${host}:${port}`);
    });
}else{
    app.listen(PORT, () => console.log(`server starter on PORT=${PORT}`));
}