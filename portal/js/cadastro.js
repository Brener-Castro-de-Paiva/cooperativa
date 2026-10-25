/* COJURIS — CADASTRO E LOGIN */

import { db } from "./firebase-config.js";
import { criarConta, entrar } from "./auth.js";
import {
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// 1. Elementos da página
const cadastroBox = document.getElementById("cadastro-box");
const loginBox = document.getElementById("login-box");
const formCadastro = document.getElementById("form-cadastro");
const formLogin = document.getElementById("form-login");

// 2. Alternar os formulários (botões acessíveis)
document.querySelectorAll(".toggle-link").forEach(botao => {
    botao.addEventListener("click", () => {
        cadastroBox.classList.toggle("hidden");
        loginBox.classList.toggle("hidden");
    });
});

// 3. Mensagens para o usuário
function mostrarMensagem(id, texto, tipo) {
    const elemento = document.getElementById(id);
    elemento.textContent = texto;
    elemento.className = `mensagem ${tipo}`;
    elemento.classList.remove("hidden");
}

// 4. Cadastro de interessados
formCadastro.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const nome = document.getElementById("nome").value.trim();
    const email = document.getElementById("email").value.trim();
    const oab = document.getElementById("oab").value.trim();
    const senha = document.getElementById("senha").value;

    const botao = formCadastro.querySelector('button[type="submit"]');
    botao.disabled = true;
    botao.textContent = "Cadastrando...";

    let contaCriada = false;

    try {
        // Cria a identidade no Firebase Authentication
        const credencial = await criarConta(email, senha);
        contaCriada = true;

        // Registra a manifestação no Firestore
        await setDoc(doc(db, "interessados", credencial.user.uid), {
            nome,
            email,
            oab,
            status: "pendente",
            dataCadastro: serverTimestamp()
        });

        mostrarMensagem(
            "mensagem-cadastro",
            "Manifestação de interesse registrada com sucesso! Você já pode fazer login.",
            "sucesso"
        );

        formCadastro.reset();

    } catch (erro) {
        console.error("Falha no cadastro:", erro.code);

        let texto;
        if (contaCriada) {
            texto = "Sua conta foi criada, mas não foi possível concluir a inscrição. Entre em contato com o suporte antes de tentar novamente.";
        } else if (erro.code === "auth/email-already-in-use") {
            texto = "Este e-mail já possui cadastro. Utilize a opção de login.";
        } else if (erro.code === "auth/weak-password") {
            texto = "Sua senha precisa ter pelo menos 6 caracteres.";
        } else if (erro.code === "auth/invalid-email") {
            texto = "O e-mail informado não é válido.";
        } else {
            texto = "Não foi possível concluir o cadastro. Verifique os dados e tente novamente.";
        }

        mostrarMensagem("mensagem-cadastro", texto, "erro");
    } finally {
        botao.disabled = false;
        botao.textContent = "Cadastrar Interesse";
    }
});

// 5. Login
formLogin.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const email = document.getElementById("login-email").value.trim();
    const senha = document.getElementById("login-senha").value;

    const botao = formLogin.querySelector('button[type="submit"]');
    botao.disabled = true;
    botao.textContent = "Entrando...";

    try {
        await entrar(email, senha);

        mostrarMensagem("mensagem-login", "Autenticação realizada com sucesso! Redirecionando...", "sucesso");
        
        // Redireciona para o painel após breve delay (para usuário ver a mensagem)
        setTimeout(() => {
            window.location.href = "painel.html";
        }, 800);

    } catch (erro) {
        console.error("Falha na autenticação:", erro.code);

        let texto;
        if (erro.code === "auth/invalid-credential" || erro.code === "auth/wrong-password") {
            texto = "E-mail ou senha incorretos.";
        } else if (erro.code === "auth/user-not-found") {
            texto = "Nenhuma conta encontrada com este e-mail.";
        } else if (erro.code === "auth/too-many-requests") {
            texto = "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
        } else {
            texto = "Não foi possível entrar. Confira suas credenciais.";
        }

        mostrarMensagem("mensagem-login", texto, "erro");
    } finally {
        botao.disabled = false;
        botao.textContent = "Entrar";
    }
});