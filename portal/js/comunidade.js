
/* ============================================================
   COJURIS — COMUNIDADE PROFISSIONAL
   ARQUIVO: portal/js/comunidade.js

   01 — Importação do Firebase
   02 — Identificação dos elementos
   03 — Controle de apresentação
   04 — Consulta administrativa
   05 — Classificação das permissões
   06 — Inicialização da sessão

   POLÍTICA:
   - Administrador: acesso administrativo.
   - Aprovado e verificado: participante.
   - Pendente ou aprovado sem verificação: leitor.
   - Rejeitado ou não autenticado: sem acesso.

   Esta versão não concede permissões de escrita.
   ============================================================ */


// ============================================================
// 01 — FIREBASE
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
// 02 — ELEMENTOS DA INTERFACE
// ============================================================

const aplicativo = document.getElementById("comunidade-app");

const telaAcesso = document.getElementById("comunidade-acesso");

const mensagemAcesso = document.getElementById(
    "comunidade-mensagem"
);

const indicadorPerfil = document.getElementById(
    "comunidade-perfil"
);

const avisoLeitura = document.getElementById(
    "aviso-modo-leitura"
);


// ============================================================
// 03 — APRESENTAÇÃO DAS TELAS
// ============================================================

function mostrarMensagem(texto) {

    aplicativo.hidden = true;

    telaAcesso.hidden = false;

    mensagemAcesso.textContent = texto;
}


function liberarPagina(perfil) {

    // Identificamos o perfil somente depois de
    // consultar os dados autenticados no Firebase.

    document.body.dataset.perfilComunidade = perfil;

    telaAcesso.hidden = true;

    aplicativo.hidden = false;

    const nomes = {
        administrador: "Administração",
        participante: "Participante verificado",
        leitor: "Modo leitura"
    };

    if (indicadorPerfil) {

        indicadorPerfil.textContent =
            nomes[perfil] || "Comunidade";
    }

    if (avisoLeitura) {

        avisoLeitura.hidden = perfil !== "leitor";
    }
}


// ============================================================
// 04 — IDENTIFICAÇÃO DO ADMINISTRADOR
// ============================================================

async function ehAdministrador(usuario) {

    const referencia = doc(
        db,
        "administradores",
        usuario.uid
    );

    const resultado = await getDoc(referencia);

    return resultado.exists() &&
           resultado.data().ativo === true;
}


// ============================================================
// 05 — CLASSIFICAR A AUTORIZAÇÃO
// ============================================================

async function identificarPerfil(usuario) {

    // A administração possui autorização própria.

    if (await ehAdministrador(usuario)) {

        return "administrador";
    }


    // Consultar exclusivamente o cadastro do titular.

    const referencia = doc(
        db,
        "interessados",
        usuario.uid
    );

    const resultado = await getDoc(referencia);

    if (!resultado.exists()) {

        return "sem_cadastro";
    }

    const dados = resultado.data();


    // Rejeitados não podem visualizar a comunidade.

    if (dados.status === "rejeitado") {

        return "rejeitado";
    }


    // Participação exige aprovação e verificação.

    if (
        dados.status === "aprovado" &&
        dados.verificacaoProfissional === "verificada"
    ) {

        return "participante";
    }


    // Interessados pendentes ou aprovados
    // ainda não verificados podem apenas visualizar.

    if (
        dados.status === "pendente" ||
        dados.status === "aprovado"
    ) {

        return "leitor";
    }


    // Situações desconhecidas não recebem acesso.

    return "sem_permissao";
}


// ============================================================
// 06 — AUTENTICAÇÃO E AUTORIZAÇÃO
// ============================================================

mostrarMensagem("Verificando sua autorização...");

onAuthStateChanged(

    auth,

    async (usuario) => {

        if (!usuario) {

            window.location.replace("./index.html");

            return;
        }

        try {

            const perfil = await identificarPerfil(usuario);

            if (
                perfil === "administrador" ||
                perfil === "participante" ||
                perfil === "leitor"
            ) {

                liberarPagina(perfil);

                return;
            }

            const mensagens = {

                rejeitado:
                    "Sua solicitação de ingresso não está " +
                    "habilitada para acessar a comunidade.",

                sem_cadastro:
                    "Não encontramos sua manifestação " +
                    "de interesse na COJURIS.",

                sem_permissao:
                    "Não foi possível autorizar seu acesso."
            };

            mostrarMensagem(
                mensagens[perfil] ||
                "Acesso não autorizado."
            );

        } catch (erro) {

            console.error(
                "COJURIS — Autorização:",
                erro.code || erro.message
            );

            mostrarMensagem(
                "Não foi possível verificar suas permissões. " +
                "Confira sua conexão e tente novamente."
            );
        }
    },

    (erro) => {

        console.error(
            "COJURIS — Autenticação:",
            erro
        );

        mostrarMensagem(
            "Não foi possível verificar sua sessão."
        );
    }
);
