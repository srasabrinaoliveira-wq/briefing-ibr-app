const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const XLSX = require('xlsx');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cors = require('cors');

const app = express();

// --- CONFIGURAÇÕES ---
app.use(cors());
app.use(bodyParser.json()); // Importante para ler o JSON do novo HTML
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configuração da IA (Gemini)
// Nota: No Render, você vai configurar a variável GEMINI_API_KEY
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "SUA_CHAVE_AQUI_SE_TESTAR_LOCAL");

// Banco de dados temporário
let eventosCadastrados = [];

// --- ROTAS DE TELAS ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/aprovacao', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'aprovacao.html'));
});

// --- ROTA 1: RECEBER O FORMULÁRIO (NOVO FORMATO) ---
app.post('/api/eventos', async (req, res) => {
    try {
        const dados = req.body;
        
        // Achata os dados para caber no Excel de forma bonita
        const eventoExcel = {
            Protocolo: dados.cabecalho.protocolo,
            Data_Registro: dados.cabecalho.dataRegistro,
            Status_Prazo: dados.cabecalho.statusPrazo,
            Nome_Evento: dados.informacoesGerais.evento,
            Tipo: dados.informacoesGerais.tipo,
            Responsavel: dados.informacoesGerais.responsavel,
            Data_Evento: dados.dataLocal.data,
            Objetivo: dados.publico.objetivo,
            Pagante: dados.financeiro.pago
        };

        eventosCadastrados.push(eventoExcel);

        // Disparo de E-mail
        if(process.env.EMAIL_USER) {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
            });

            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: process.env.EMAIL_USER,
                subject: `🔔 Novo Evento IBR: ${dados.informacoesGerais.evento}`,
                text: `Novo evento cadastrado!\n\nProtocolo: ${dados.cabecalho.protocolo}\nResponsável: ${dados.informacoesGerais.responsavel}\nData: ${dados.dataLocal.data}\n\nVerifique o painel administrativo.`
            });
        }

        res.status(200).json({ message: "Sucesso" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro ao salvar evento" });
    }
});

// --- ROTA 2: INTELIGÊNCIA ARTIFICIAL (IDEIAS) ---
app.post('/api/ia/ideias', async (req, res) => {
    try {
        const { evento, tipo } = req.body;
        const model = genAI.getGenerativeModel({ model: "gemini-pro"});

        const prompt = `Atue como um estrategista de eventos cristãos para a "Igreja Batista do Reino".
        Sugira um OBJETIVO curto e impactante e um TEMA COM VERSÍCULO para um evento do tipo "${tipo}" chamado "${evento}".
        Responda em formato JSON assim: { "objetivo": "...", "temaVersiculo": "...", "descricao": "..." }`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Limpeza básica para garantir JSON válido
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '');
        res.json(JSON.parse(jsonStr));

    } catch (error) {
        console.error("Erro IA:", error);
        res.status(500).json({ error: "Erro ao consultar IA" });
    }
});

// --- ROTA 3: INTELIGÊNCIA ARTIFICIAL (SOCIAL MEDIA) ---
app.post('/api/ia/social', async (req, res) => {
    try {
        const dados = req.body;
        const model = genAI.getGenerativeModel({ model: "gemini-pro"});

        const prompt = `Crie uma legenda para Instagram para o evento "${dados.evento}" da Igreja Batista do Reino.
        Data: ${dados.data}. Objetivo: ${dados.objetivo}.
        O tom deve ser inspirador e convidativo. Use emojis.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        
        res.json({ texto: response.text() });

    } catch (error) {
        console.error("Erro IA Social:", error);
        res.status(500).json({ error: "Erro ao gerar texto" });
    }
});

// --- ROTA 4: EXCEL ---
app.get('/api/exportar', (req, res) => {
    const ws = XLSX.utils.json_to_sheet(eventosCadastrados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Eventos");
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', 'attachment; filename="Relatorio_IBR.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor IBR rodando na porta ${PORT}`);
});