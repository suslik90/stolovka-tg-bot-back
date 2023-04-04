const express = require('express');
const cors = require('cors');
require('dotenv').config();
const https = require('https');
const fs = require('fs');

const { DateTime } = require("luxon");

const { GoogleSpreadsheet } = require('google-spreadsheet');
const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID);
const creds = require('./menu/creds.json');
doc.useServiceAccountAuth(creds);

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

const MENU_START_ROW = 2;

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.chat?.first_name;
    const text = msg.text;

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

    let menuMeals = [];
    let catogoriesArray = [];

    try {
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle[worksheetName];
        const rows = await sheet.getRows();
        for (const [key, row] of Object.entries(rows)) {
            const mealCategory = row['Категория'];
            if (!catogoriesArray.includes(mealCategory)) catogoriesArray.push(mealCategory);
            const imageChunks = row['Фото']!= undefined ? row['Фото'].split("/") : [];
            const imageFileId = imageChunks.length > 5 ? imageChunks[5] : "";
            const binaryUrl = imageFileId.length > 0 ? `https://drive.google.com/uc?id=${imageFileId}`:"";
            menuMeals.push({
                name: row['Блюдо'],
                description: row['Описание'],
                category: mealCategory,
                price: row['Цена'],
                image: "",
                binaryUrl: binaryUrl
            });

        }
        let groupedMeals = catogoriesArray.map((categoryName) => {
            const mealsByCategory = menuMeals.filter((menuItem) => menuItem.category == categoryName);
            return { category: categoryName, meals: mealsByCategory };
        });

        const menu = {
            "menu": groupedMeals
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
        const paymentIsCash = data.delivery.payment == 'cash';
        const needHitBack = data.delivery.hitBack && data.delivery.hitBackSum != undefined;
        data.delivery.paymentString = paymentIsCash ? "Наличные" : "Онлайн";
        data.delivery.hitBackMessage = needHitBack ? `Нужна сдача с ${data.delivery.hitBackSum}р` : ``;
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
            messageOrder += `\n<b>Оплата:</b> ${data.delivery.paymentString}\n`;
            if (needHitBack) messageOrder += `Нужна сдача с ${data.delivery.hitBackSum}р\n`;
            messageOrder += `Комментарий: ${data.delivery.comment}`;
            const messageTotalOrder = `Общая сумма вашего заказа <b>${data.orderTotalPrice}р</b>. С вами свяжется менеджер для подтверждения заказа👍`;
            try {
                await bot.answerWebAppQuery(queryId, {
                    type: 'article',
                    title: 'Заказ оформлен',
                    id: queryId,
                    input_message_content: {
                        message_text: messageHeader + delimeter + messageDelivery + delimeter + messageOrder + delimeter + messageTotalOrder,
                        parse_mode: 'HTML'
                    }
                });
            } catch (e) {

            }
            res.status(200).json({ "result": "OK" });
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