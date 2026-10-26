
/* ============================================================
   COJURIS — CONTROLE DE ACESSO À COMUNIDADE

   ARQUIVO: portal/js/comunidade.js

   FINALIDADE:
   1. Verificar a sessão do Firebase Authentication.
   2. Identificar administradores autorizados.
   3. Consultar a situação cadastral do interessado.
   4. Exigir aprovação e verificação profissional.
   5. Exibir a comunidade apenas quando autorizado.
   6. Apresentar orientações quando o acesso for negado.

   IMPORTANTE:
   Este módulo controla a exibição da página.

   A segurança dos dados será implementada também
   pelas regras do Firestore antes de disponibilizarmos
   publicações, comentários e sugestões reais.
   ============================================================ */


// ============================================================
// 01 — IMPORTAÇÕES
// ============================================================

import { auth, db } from "./firebase-config.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";


// ============================================================
// 02 — ELEMENTOS DA PÁGINA
// ============================================================

const comunidade = document.getElementById("comunidade-app");

const telaAcesso = document.getElementById("comunidade-acesso");

const mensagemAcesso = document.getElementById(
    "comunidade-mensagem"
);


// ============================================================
// 03 — CONTROLE DA INTERFACE
// ============================================================

// Mostra o aviso de carregamento ou impedimento de acesso.

function mostrarAviso(mensagem) {

    comunidade.hidden = true;

    telaAcesso.hidden = false;

    mensagemAcesso.textContent = mensagem;
}


// Mostra a comunidade depois das verificações.

function liberarComunidade() {

    telaAcesso.hidden = true;

    comunidade.hidden = false;
}


// ============================================================
// 04 — IDENTIFICAÇÃO DO ADMINISTRADOR
// ============================================================

async function verificarAdministrador(usuario) {

    const referencia = doc(
        db,
        "administradores",
        usuario.uid
    );

    const resultado = await getDoc(referencia);

    return (
        resultado.exists() &&
        resultado.data().ativo === true
    );
}


// ============================================================
// 05 — VERIFICAÇÃO DO CADASTRO PROFISSIONAL
// ============================================================

async function verificarProfissional(usuario) {

    const referencia = doc(
        db,
        "interessados",
        usuario.uid
    );

    const resultado = await getDoc(referencia);

    // Sem cadastro de interessado

    if (!resultado.exists()) {

        return {
            autorizado: false,
            mensagem:
                "Não encontramos sua manifestação de interesse."
        };
    }

    const dados = resultado.data();


    // Cadastro não aprovado

    if (dados.status !== "aprovado") {

        return {
            autorizado: false,
            mensagem:
                "Sua manifestação de interesse ainda não " +
                "está aprovada para participar da comunidade."
        };
    }


    // Identidade profissional não verificada

    if (dados.verificacaoProfissional !== "verificada") {

        return {
            autorizado: false,
            mensagem:
                "Seu cadastro foi aprovado, mas a " +
                "verificação profissional ainda está pendente."
        };
    }


    // Usuário aprovado e verificado

    return {
        autorizado: true,
        mensagem: ""
    };
}


// ============================================================
// 06 — CONTROLE CENTRAL DE AUTORIZAÇÃO
// ============================================================

async function controlarAcesso(usuario) {

    // Nenhuma sessão autenticada

    if (!usuario) {

        window.location.replace("./index.html");

        return;
    }


    try {

        // Administradores ativos podem acessar a comunidade.

        const ehAdministrador =
            await verificarAdministrador(usuario);

        if (ehAdministrador) {

            liberarComunidade();

            return;
        }


        // Outros usuários precisam estar aprovados
        // e possuir a identidade profissional verificada.

        const verificacao =
            await verificarProfissional(usuario);


        if (!verificacao.autorizado) {

            mostrarAviso(verificacao.mensagem);

            return;
        }


        // Liberação

        liberarComunidade();

    } catch (erro) {

        console.error(
            "COJURIS — Erro de autorização:",
            erro.code || erro.message
        );

        mostrarAviso(
            "Não foi possível verificar suas permissões. " +
            "Confira sua conexão e tente novamente."
        );
    }
}


// ============================================================
// 07 — OBSERVADOR DE AUTENTICAÇÃO
// ============================================================

// O Firebase informa quando a sessão inicial é conhecida.

mostrarAviso("Verificando seu acesso à comunidade...");

onAuthStateChanged(
    auth,
    controlarAcesso,
    (erro) => {

        console.error(
            "COJURIS — Erro de autenticação:",
            erro
        );

        mostrarAviso(
            "Não foi possível verificar sua sessão."
        );
    }
);
