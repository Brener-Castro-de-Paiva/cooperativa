
/* ===========================================
   COJURIS — PAINEL ADMINISTRATIVO
   =========================================== */

import { auth, db } from "./firebase-config.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    updateDoc
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";


// 1. ELEMENTOS HTML

const mensagem = document.getElementById("admin-mensagem");
const lista = document.getElementById("lista-interessados");
const btnSair = document.getElementById("admin-sair");

btnSair.disabled = true;


// 2. VERIFICAÇÃO DO ADMINISTRADOR

onAuthStateChanged(auth, async (usuario) => {

    if (!usuario) {
        window.location.replace("index.html");
        return;
    }

    try {

        const adminRef = doc(
            db,
            "administradores",
            usuario.uid
        );

        const adminDoc = await getDoc(adminRef);

        if (!adminDoc.exists() ||
            adminDoc.data().ativo !== true) {

            mensagem.textContent = "Acesso não autorizado.";
            return;
        }

        btnSair.disabled = false;

        await carregarInteressados();

    } catch (erro) {

        console.error("Erro de autorização:", erro.code);

        mensagem.textContent =
            "Não foi possível verificar suas permissões.";
    }

});


// 3. CONSULTAR INTERESSADOS

async function carregarInteressados() {

    mensagem.textContent = "Carregando solicitações...";

    lista.replaceChildren();

    try {

        const resultado = await getDocs(
            collection(db, "interessados")
        );

        let pendentes = 0;
        let aprovados = 0;
        let rejeitados = 0;

        resultado.forEach(documento => {

            const dados = documento.data();

            if (dados.status === "pendente") pendentes++;
            if (dados.status === "aprovado") aprovados++;
            if (dados.status === "rejeitado") rejeitados++;

            criarCartao(documento.id, dados);
        });

        mensagem.textContent =
            `Total: ${resultado.size} | ` +
            `Pendentes: ${pendentes} | ` +
            `Aprovados: ${aprovados} | ` +
            `Rejeitados: ${rejeitados}`;

    } catch (erro) {

        console.error("Erro ao consultar:", erro.code);

        mensagem.textContent =
            "Não foi possível consultar os interessados.";
    }
}


// 4. CRIAR CARTÃO DE CADA INTERESSADO

function criarCartao(uid, dados) {

    const cartao = document.createElement("article");
    cartao.className = "admin-card";

    const titulo = document.createElement("h3");
    titulo.textContent = dados.nome || "Nome não informado";

    const email = document.createElement("p");
    email.textContent = `E-mail: ${dados.email || ""}`;

    const oab = document.createElement("p");
    oab.textContent = `OAB: ${dados.oab || ""}`;

    const status = document.createElement("p");
    status.textContent = `Situação: ${dados.status || "indefinida"}`;

    const acoes = document.createElement("div");
    acoes.className = "admin-acoes";

    cartao.append(titulo, email, oab, status);

    if (dados.status === "pendente") {

        const aprovar = document.createElement("button");
        aprovar.textContent = "Aprovar";
        aprovar.className = "btn-aprovar";

        const rejeitar = document.createElement("button");
        rejeitar.textContent = "Rejeitar";
        rejeitar.className = "btn-rejeitar";

        aprovar.addEventListener("click", () => {
            alterarStatus(uid, "aprovado", acoes);
        });

        rejeitar.addEventListener("click", () => {
            alterarStatus(uid, "rejeitado", acoes);
        });

        acoes.append(aprovar, rejeitar);
        cartao.appendChild(acoes);
    }

    lista.appendChild(cartao);
}


// 5. APROVAR OU REJEITAR

async function alterarStatus(uid, novoStatus, acoes) {

    const pergunta = novoStatus === "aprovado"
        ? "Confirma a aprovação desta solicitação?"
        : "Confirma a rejeição desta solicitação?";

    if (!window.confirm(pergunta)) return;

    const botoes = acoes.querySelectorAll("button");

    botoes.forEach(botao => {
        botao.disabled = true;
    });

    try {

        await updateDoc(
            doc(db, "interessados", uid),
            {
                status: novoStatus
            }
        );

        await carregarInteressados();

    } catch (erro) {

        console.error("Erro ao alterar status:", erro.code);

        mensagem.textContent =
            "Não foi possível atualizar a solicitação.";

        botoes.forEach(botao => {
            botao.disabled = false;
        });
    }
}


// 6. ENCERRAR SESSÃO

btnSair.addEventListener("click", async () => {

    btnSair.disabled = true;

    try {

        await signOut(auth);

        window.location.replace("index.html");

    } catch (erro) {

        console.error("Erro ao sair:", erro.code);

        mensagem.textContent =
            "Não foi possível encerrar a sessão.";

        btnSair.disabled = false;
    }
});
