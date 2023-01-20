const express = require('express');
const cors = require('cors');

const { DateTime } = require("luxon");

const TelegramBot = require('node-telegram-bot-api');

const ExcelJS = require('exceljs');
const filePath = "menu/menu.xlsx";
const worksheetName = "Лист1";

const token = '5639840401:AAFxjQmzi8VdtBMkUtHGjyCVj-adk-KnhpQ';

const bot = new TelegramBot(token, { polling: true });
const webAppURL = "https://moex.romansmekalov.ru";

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
                    "name": rowValues[1],
                    "cost": rowValues[2]
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
        res.status(500).json({"errorName":e.name, "errorMessage":e.message});
    }
});

const PORT = 8082;
app.listen(PORT, () => console.log(`server starter on PORT=${PORT}`));