
/* ============================================================
   COJURIS — PAINEL DO COOPERADO

   Firebase Authentication + Cloud Firestore

   FUNCIONALIDADES:
   1. Verificação de autenticação
   2. Carregamento do cadastro
   3. Apresentação da situação cadastral
   4. Identificação de administrador
   5. Acesso de retorno à administração
   6. Navegação entre telas
   7. Encerramento da sessão
   ============================================================ */


// ============================================================
// 01 — IMPORTAÇÕES
// ============================================================

import { auth, db } from "./firebase-config.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";


// ============================================================
// 02 — ELEMENTOS DA PÁGINA
// ============================================================

const dashboard = document.getElementById("dashboard");

const feedback = document.getElementById("painel-feedback");

const botaoSair = document.getElementById("btn-sair");

const linkAdmin = document.getElementById("voltar-admin");


// ============================================================
// 03 — FUNÇÕES AUXILIARES
// ============================================================

function definirTexto(id, texto) {

    const elemento = document.getElementById(id);

    if (elemento) {
        elemento.textContent = texto;
    }
}


function exibirErro(texto) {

    if (dashboard) {
        dashboard.hidden = true;
    }

    if (feedback) {
        feedback.hidden = false;
        feedback.textContent = texto;
    }
}


// ============================================================
// 04 — VERIFICAR PERMISSÃO ADMINISTRATIVA
// ============================================================

async function verificarAdministrador(usuario) {

    const referencia = doc(
        db,
        "administradores",
        usuario.uid
    );

    const documento = await getDoc(referencia);

    return (
        documento.exists() &&
        documento.data().ativo === true
    );
}


// ============================================================
// 05 — CONTROLAR ACESSO À ADMINISTRAÇÃO
// ============================================================

function configurarAcessoAdmin(ehAdministrador) {

    if (!linkAdmin) {
        return;
    }

    // O link aparece apenas para administradores.
    linkAdmin.hidden = !ehAdministrador;
}


// ============================================================
// 06 — APRESENTAR SITUAÇÃO CADASTRAL
// ============================================================

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


    // Caso a situação não seja reconhecida

    if (!situacao) {

        definirTexto(
            "situacao-titulo",
            "Situação indisponível"
        );

        definirTexto(
            "situacao-descricao",
            "Não foi possível identificar a situação cadastral."
        );

        definirTexto(
            "perfil-status",
            "Indisponível"
        );

        definirTexto(
            "atividade-status",
            "Situação cadastral indisponível."
        );

        if (chip) {
            chip.textContent = "Situação indisponível";
            chip.className = "status-chip";
        }

        return;
    }


    // Atualizar informações da página

    definirTexto(
        "situacao-titulo",
        situacao.titulo
    );

    definirTexto(
        "situacao-descricao",
        situacao.descricao
    );

    definirTexto(
        "perfil-status",
        situacao.etiqueta
    );

    definirTexto(
        "atividade-status",
        situacao.descricao
    );


    // Atualizar indicador visual

    if (chip) {

        chip.textContent = situacao.etiqueta;

        chip.className = `status-chip ${status}`;
    }
}


// ============================================================
// 07 — PREENCHER DADOS DO COOPERADO
// ============================================================

function preencherPainel(dados) {

    const nome = typeof dados.nome === "string"
        ? dados.nome.trim()
        : "";

    const primeiroNome = nome.split(/\s+/)[0] || "Cooperado";


    // Saudação personalizada

    definirTexto(
        "nome-usuario",
        primeiroNome
    );


    // Perfil profissional

    definirTexto(
        "perfil-nome",
        nome || "Não informado"
    );

    definirTexto(
        "perfil-email",
        dados.email || "Não informado"
    );

    definirTexto(
        "perfil-oab",
        dados.oab || "Não informado"
    );


    // Inicial do nome

    definirTexto(
        "perfil-inicial",
        primeiroNome.charAt(0).toUpperCase()
    );


    // Situação cadastral

    apresentarSituacao(dados.status);
}


// ============================================================
// 08 — AUTENTICAÇÃO E CARREGAMENTO DO PAINEL
// ============================================================

onAuthStateChanged(auth, async (usuario) => {

    // Caso não exista usuário autenticado

    if (!usuario) {

        window.location.replace("index.html");

        return;
    }


    // Ocultar acesso administrativo durante a verificação

    configurarAcessoAdmin(false);


    try {

        // 8.1 — Verificar se o usuário é administrador

        const ehAdministrador = await verificarAdministrador(
            usuario
        );


        // 8.2 — Carregar cadastro do interessado

        const referencia = doc(
            db,
            "interessados",
            usuario.uid
        );

        const resultado = await getDoc(referencia);


        // 8.3 — Cadastro não encontrado

        if (!resultado.exists()) {

            exibirErro(
                "Não encontramos um cadastro de interessado " +
                "vinculado à sua conta. Entre em contato " +
                "com a administração."
            );

            return;
        }


        // 8.4 — Preencher dados

        preencherPainel(resultado.data());


        // 8.5 — Liberar link para administrador

        configurarAcessoAdmin(ehAdministrador);


        // 8.6 — Exibir painel

        feedback.hidden = true;

        dashboard.hidden = false;

    } catch (erro) {

        console.error(
            "Erro ao carregar painel:",
            erro.code || erro.message
        );

        exibirErro(
            "Não foi possível carregar seu painel. " +
            "Verifique sua conexão e atualize a página."
        );
    }

});


// ============================================================
// 09 — NAVEGAÇÃO INFERIOR
// ============================================================

const telas = {

    inicio: document.getElementById("tela-inicio"),

    atividades: document.getElementById("tela-atividades"),

    perfil: document.getElementById("tela-perfil")

};


document.querySelectorAll(".nav-item").forEach((botao) => {

    botao.addEventListener("click", () => {

        const destino = botao.dataset.tela;


        // Validar a tela solicitada

        if (!Object.hasOwn(telas, destino)) {
            return;
        }


        // Mostrar somente a tela selecionada

        Object.entries(telas).forEach(([nome, tela]) => {

            if (tela) {
                tela.hidden = nome !== destino;
            }

        });


        // Atualizar indicação da navegação

        document.querySelectorAll(".nav-item").forEach((item) => {

            const ativo = item === botao;

            item.classList.toggle("active", ativo);


            if (ativo) {

                item.setAttribute(
                    "aria-current",
                    "page"
                );

            } else {

                item.removeAttribute("aria-current");
            }

        });


        // Retornar ao início da página

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

    });

});


// ============================================================
// 10 — ENCERRAR SESSÃO
// ============================================================

if (botaoSair) {

    botaoSair.addEventListener("click", async () => {

        botaoSair.disabled = true;


        try {

            await signOut(auth);

            window.location.replace("index.html");

        } catch (erro) {

            console.error(
                "Erro ao encerrar sessão:",
                erro.code || erro.message
            );

            alert(
                "Não foi possível encerrar a sessão. " +
                "Tente novamente."
            );

            botaoSair.disabled = false;
        }

    });

}
