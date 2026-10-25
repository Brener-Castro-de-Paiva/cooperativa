
/* ============================================================
   COJURIS — PAINEL DO COOPERADO
   Firebase Authentication + Cloud Firestore
   ============================================================ */

// 01 — IMPORTAÇÕES

import { auth, db } from "./firebase-config.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";


// 02 — ELEMENTOS DA PÁGINA

const dashboard = document.getElementById("dashboard");
const feedback = document.getElementById("painel-feedback");
const botaoSair = document.getElementById("btn-sair");


// 03 — FUNÇÕES AUXILIARES

function definirTexto(id, texto) {
    const elemento = document.getElementById(id);

    if (elemento) {
        elemento.textContent = texto;
    }
}

function exibirErro(texto) {
    dashboard.hidden = true;
    feedback.hidden = false;
    feedback.textContent = texto;
}


// 04 — APRESENTAR SITUAÇÃO CADASTRAL

function apresentarSituacao(status) {

    const chip = document.getElementById("status-chip");

    const situacoes = {

        pendente: {
            titulo: "Solicitação em análise",
            descricao:
                "Recebemos sua manifestação de interesse. " +
                "Ela aguarda análise administrativa.",
            etiqueta: "Cadastro pendente"
        },

        aprovado: {
            titulo: "Solicitação aprovada",
            descricao:
                "Sua manifestação de interesse foi aprovada. " +
                "Acompanhe as próximas orientações da COJURIS.",
            etiqueta: "Cadastro aprovado"
        },

        rejeitado: {
            titulo: "Solicitação não aprovada",
            descricao:
                "Sua manifestação de interesse não foi aprovada " +
                "nesta análise. Entre em contato com a administração " +
                "para solicitar esclarecimentos.",
            etiqueta: "Cadastro não aprovado"
        }
    };

    const situacao = situacoes[status];

    // Não apresentar um status desconhecido
    // como se estivesse aprovado.

    if (!situacao) {
        definirTexto("situacao-titulo", "Situação indisponível");

        definirTexto(
            "situacao-descricao",
            "Não foi possível identificar a situação cadastral."
        );

        definirTexto("perfil-status", "Indisponível");

        definirTexto(
            "atividade-status",
            "Situação cadastral indisponível."
        );

        chip.textContent = "Situação indisponível";
        chip.className = "status-chip";

        return;
    }

    definirTexto("situacao-titulo", situacao.titulo);
    definirTexto("situacao-descricao", situacao.descricao);
    definirTexto("perfil-status", situacao.etiqueta);
    definirTexto("atividade-status", situacao.descricao);

    chip.textContent = situacao.etiqueta;
    chip.className = `status-chip ${status}`;
}


// 05 — PREENCHER DADOS DO COOPERADO

function preencherPainel(dados) {

    const nome = typeof dados.nome === "string"
        ? dados.nome.trim()
        : "";

    const primeiroNome = nome.split(/\s+/)[0] || "Cooperado";

    definirTexto("nome-usuario", primeiroNome);

    definirTexto("perfil-nome", nome || "Não informado");

    definirTexto(
        "perfil-email",
        dados.email || "Não informado"
    );

    definirTexto(
        "perfil-oab",
        dados.oab || "Não informado"
    );

    definirTexto(
        "perfil-inicial",
        primeiroNome.charAt(0).toUpperCase()
    );

    apresentarSituacao(dados.status);
}


// 06 — AUTENTICAÇÃO E CARREGAMENTO

onAuthStateChanged(auth, async (usuario) => {

    if (!usuario) {
        window.location.replace("index.html");
        return;
    }

    try {

        const referencia = doc(
            db,
            "interessados",
            usuario.uid
        );

        const resultado = await getDoc(referencia);

        if (!resultado.exists()) {

            exibirErro(
                "Não encontramos um cadastro de interessado " +
                "vinculado à sua conta. Entre em contato " +
                "com a administração."
            );

            return;
        }

        preencherPainel(resultado.data());

        feedback.hidden = true;
        dashboard.hidden = false;

    } catch (erro) {

        console.error(
            "Erro ao carregar painel:",
            erro.code
        );

        exibirErro(
            "Não foi possível carregar seu painel. " +
            "Verifique a conexão e atualize a página."
        );
    }

});


// 07 — NAVEGAÇÃO INFERIOR

const telas = {
    inicio: document.getElementById("tela-inicio"),
    atividades: document.getElementById("tela-atividades"),
    perfil: document.getElementById("tela-perfil")
};

document.querySelectorAll(".nav-item").forEach((botao) => {

    botao.addEventListener("click", () => {

        const destino = botao.dataset.tela;

        if (!Object.hasOwn(telas, destino)) {
            return;
        }

        // Esconder telas não selecionadas
        Object.entries(telas).forEach(([nome, tela]) => {
            tela.hidden = nome !== destino;
        });

        // Atualizar navegação
        document.querySelectorAll(".nav-item").forEach((item) => {

            const ativo = item === botao;

            item.classList.toggle("active", ativo);

            if (ativo) {
                item.setAttribute("aria-current", "page");
            } else {
                item.removeAttribute("aria-current");
            }
        });

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

    });

});


// 08 — ENCERRAR SESSÃO

botaoSair.addEventListener("click", async () => {

    botaoSair.disabled = true;

    try {

        await signOut(auth);

        window.location.replace("index.html");

    } catch (erro) {

        console.error("Erro ao sair:", erro.code);

        alert(
            "Não foi possível encerrar a sessão. Tente novamente."
        );

        botaoSair.disabled = false;
    }

});
