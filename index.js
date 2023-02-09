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
    const username = msg.chat?.first_name;
    const text = msg.text;
    console.log("msg: ", msg);

    if (text === '/start') {
        const helloMessage = `Привет, ${username}! Мы рады, видеть тебя у нас в гостях!\n\nОзнакомиться с меню и сделать заказ можно нажав кнопку Меню ↙`;
        await bot.sendMessage(chatId, helloMessage, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Меню инлайн", web_app: { url: webAppURL } }]
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
    const queryId = data.queryId;

    try {
        const subject = process.env.ADMIN_EMAIL_SUBJECT;
        const emailTemplateName = process.env.ADMIN_EMAIL_TEMPLATE;
        data.delivery.paymentString = data.delivery.payment == 'cash' ? "Наличные" : "Онлайн";
        const sendResult = await mailService.mail(data.delivery.email, subject, emailTemplateName, data).catch(console.error);
        if (sendResult.messageId.length > 0) {
            const delimeter = `\n\n`;
            const messageHeader = `Спасибо за заказ!🤝`;
            const messageDelivery = `<b>Доставим сюда:</b>\nУлица и дом: ${data.delivery.street}\n№ квартиры/офиса: ${data.delivery.apartment}\n` +
                `Подъезд: ${data.delivery.entrance}\nЭтаж:${data.delivery.level}\n\n<b>Ваши контакты:</b>\nИмя: ${data.delivery.name}\n` +
                `Телефон: ${data.delivery.phone}`;
            let messageOrder = `<b>Заказ:</b>\n`;
            data.order.map((item) => {
                let orderItemString = `${item.name}\n${item.count}шт * ${item.price}р = ${item.totalPrice}р`;
                messageOrder += orderItemString + '\n';
            });
            messageOrder += `\n<b>Оплата:</b> ${data.delivery.paymentString}\nКомментарий: ${data.delivery.comment}`;
            const messageTotalOrder = `Общая сумма вашего заказа <b>${data.orderTotalPrice}р</b>. С вами свяжется менеджер для подтверждения заказа👍`;
            await bot.answerWebAppQuery(queryId, {
                type: 'article',
                title: 'Заказ оформлен',
                id: queryId,
                input_message_content: {
                    message_text: messageHeader + delimeter + messageDelivery + delimeter + messageOrder + delimeter + messageTotalOrder,
                    parse_mode: 'HTML'
                }
            });
            res.status(200).json({ "messageId": sendResult.messageId });
        } else {
            res.status(500).json({ "errorName": "EmailError", "errorMessage": "Send admin email error" });
        }
    } catch (e) {
        console.log("Error save order", e);
        res.status(500).json({ "errorName": e.name, "errorMessage": e.message });
    }
});

const PORT = process.env.SERVER_PORT;
if (process.env.SERVER_KEY_PATH.length > 0) {
    https
        .createServer(
            {
                key: fs.readFileSync(process.env.SERVER_KEY_PATH),
                cert: fs.readFileSync(process.env.SERVER_CERT_PATH),
            },
            app
        )
        .listen(PORT, function () {
            console.log(`Server listens on PORT=${PORT}`);
        });
} else {
    app.listen(PORT, () => console.log(`Server starter on PORT=${PORT}`));
}