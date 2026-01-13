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
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configuração da IA (Gemini)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "SEM_CHAVE");

// BANCO DE DADOS NA MEMÓRIA (Reseta se o servidor reiniciar)
let eventosCadastrados = [];

// --- ROTAS DE VISUALIZAÇÃO ---
// Ajustado para procurar na pasta 'views' que você confirmou que existe
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/aprovacao', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'aprovacao.html'));
});

// --- ROTA 1: CRIAR OU ATUALIZAR EVENTO ---
app.post('/api/eventos', async (req, res) => {
    try {
        const dados = req.body;
        
        // Verifica se já existe para atualizar
        const index = eventosCadastrados.findIndex(e => e.Protocolo === dados.cabecalho.protocolo);
        
        const eventoFormatado = {
            Protocolo: dados.cabecalho.protocolo,
            Data_Registro: dados.cabecalho.dataRegistro,
            Status_Prazo: dados.cabecalho.statusPrazo,
            Nome_Evento: dados.informacoesGerais.evento,
            Tipo: dados.informacoesGerais.tipo,
            Responsavel: dados.informacoesGerais.responsavel,
            Data_Evento: dados.dataLocal.data,
            Objetivo: dados.publico.objetivo,
            Pagante: dados.financeiro.pago,
            Dados_Completos: dados // Guardamos tudo para poder editar depois
        };

        if (index >= 0) {
            eventosCadastrados[index] = eventoFormatado; // Atualiza
        } else {
            eventosCadastrados.push(eventoFormatado); // Cria novo
        }

        // Tenta enviar e-mail (se configurado)
        if(process.env.EMAIL_USER) {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
            });
            
            // Não deixa o erro de email travar o site
            transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: process.env.EMAIL_USER,
                subject: `🔔 IBR: ${dados.informacoesGerais.evento} (${dados.cabecalho.protocolo})`,
                text: `Protocolo: ${dados.cabecalho.protocolo}\nEvento salvo com sucesso.`
            }).catch(err => console.log("Erro de email (ignorado):", err));
        }

        res.status(200).json({ message: "Salvo com sucesso!" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro ao salvar evento" });
    }
});

// --- ROTA NOVA: BUSCAR POR PROTOCOLO ---
app.get('/api/eventos/:protocolo', (req, res) => {
    const proto = req.params.protocolo.toUpperCase();
    const evento = eventosCadastrados.find(e => e.Protocolo === proto);

    if (evento) {
        // Retorna os dados originais para preencher o formulário
        res.json(evento.Dados_Completos);
    } else {
        res.status(404).json({ error: "Protocolo não encontrado. Verifique se o servidor reiniciou." });
    }
});

// --- ROTAS DE IA E EXCEL (Mantidas) ---
app.post('/api/ia/ideias', async (req, res) => {
    try {
        const { evento, tipo } = req.body;
        if (!process.env.GEMINI_API_KEY) return res.json({ error: "Sem chave de IA configurada" });
        
        const model = genAI.getGenerativeModel({ model: "gemini-pro"});
        const prompt = `Atue como estrategista cristão. Sugira OBJETIVO e TEMA COM VERSÍCULO para evento "${tipo}": "${evento}". JSON: { "objetivo": "...", "temaVersiculo": "...", "descricao": "..." }`;
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '');
        res.json(JSON.parse(text));
    } catch (error) {
        res.status(500).json({ error: "Erro na IA" });
    }
});

app.post('/api/ia/social', async (req, res) => {
    try {
        if (!process.env.GEMINI_API_KEY) return res.json({ texto: "Configure a chave da IA no Render para gerar textos." });
        const dados = req.body;
        const model = genAI.getGenerativeModel({ model: "gemini-pro"});
        const prompt = `Legenda Instagram para evento igreja "${dados.evento}". Data: ${dados.data}. Objetivo: ${dados.objetivo}. Use emojis.`;
        const result = await model.generateContent(prompt);
        res.json({ texto: result.response.text() });
    } catch (error) {
        res.status(500).json({ error: "Erro na IA" });
    }
});

app.get('/api/exportar', (req, res) => {
    // Remove os dados completos para o Excel ficar limpo
    const listaSimples = eventosCadastrados.map(({ Dados_Completos, ...resto }) => resto);
    
    const ws = XLSX.utils.json_to_sheet(listaSimples);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Eventos");
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', 'attachment; filename="Relatorio_IBR.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
