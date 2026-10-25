
/* ============================================================
   COJURIS — CADASTRO E LOGIN DE INTERESSADOS

   Funcionalidades:
   1. Alternância entre cadastro e login
   2. Validação de e-mail Gmail
   3. Cadastro no Firebase Authentication
   4. Gravação no Cloud Firestore
   5. Login de usuários cadastrados
   6. Tratamento de erros
   7. Redirecionamento para o painel
   ============================================================ */


// ============================================================
// 01 — IMPORTAÇÃO DOS MÓDULOS
// ============================================================

import { auth, db } from "./firebase-config.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

import {
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";


// ============================================================
// 02 — ELEMENTOS DO HTML
// ============================================================

const cadastroBox = document.getElementById("cadastro-box");
const loginBox = document.getElementById("login-box");

const formCadastro = document.getElementById("form-cadastro");
const formLogin = document.getElementById("form-login");

const mensagemCadastro = document.getElementById("mensagem-cadastro");
const mensagemLogin = document.getElementById("mensagem-login");


// ============================================================
// 03 — VALIDAÇÃO DO GMAIL
// ============================================================

function validarGmail(email) {

    const regex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;

    return regex.test(email);
}


// ============================================================
// 04 — EXIBIÇÃO DE MENSAGENS
// ============================================================

function mostrarMensagem(elemento, texto, tipo) {

    if (!elemento) return;

    elemento.textContent = texto;

    elemento.className = `mensagem ${tipo}`;

    elemento.setAttribute("role", "alert");
}


// ============================================================
// 05 — ALTERNÂNCIA ENTRE CADASTRO E LOGIN
// ============================================================

function alternarFormularios() {

    cadastroBox.classList.toggle("hidden");

    loginBox.classList.toggle("hidden");

}

// Botões de alternância
document.querySelectorAll(".toggle-link").forEach(botao => {

    botao.addEventListener("click", alternarFormularios);

});


// ============================================================
// 06 — CADASTRO DE INTERESSADOS
// ============================================================

formCadastro.addEventListener("submit", async (evento) => {

    // Impede o recarregamento automático da página
    evento.preventDefault();

    // Recupera os dados informados
    const nome = document.getElementById("nome").value.trim();

    const email = document.getElementById("email")
        .value.trim().toLowerCase();

    const oab = document.getElementById("oab").value.trim();

    const senha = document.getElementById("senha").value;

    const botao = formCadastro.querySelector(
        'button[type="submit"]'
    );


    // --------------------------------------------------------
    // 6.1 — VALIDAÇÕES ANTES DO FIREBASE
    // --------------------------------------------------------

    if (!nome || !email || !oab || !senha) {

        mostrarMensagem(
            mensagemCadastro,
            "Preencha todos os campos obrigatórios.",
            "erro"
        );

        return;
    }


    if (!validarGmail(email)) {

        mostrarMensagem(
            mensagemCadastro,
            "Utilize um endereço @gmail.com para se cadastrar na COJURIS.",
            "erro"
        );

        return;
    }


    if (senha.length < 6) {

        mostrarMensagem(
            mensagemCadastro,
            "A senha deve conter pelo menos 6 caracteres.",
            "erro"
        );

        return;
    }


    // --------------------------------------------------------
    // 6.2 — INICIAR CADASTRO
    // --------------------------------------------------------

    botao.disabled = true;

    botao.textContent = "Cadastrando...";

    let contaCriada = false;


    try {

        // Cria a conta no Firebase Authentication
        const credencial = await createUserWithEmailAndPassword(
            auth,
            email,
            senha
        );

        contaCriada = true;

        const usuario = credencial.user;


        // Salva o registro no Firestore
        await setDoc(
            doc(db, "interessados", usuario.uid),
            {
                nome: nome,
                email: email,
                oab: oab,
                status: "pendente",
                dataCadastro: serverTimestamp()
            }
        );


        // Mensagem de sucesso
        mostrarMensagem(
            mensagemCadastro,
            "Sua manifestação de interesse foi registrada com sucesso!",
            "sucesso"
        );


        // Limpa o formulário
        formCadastro.reset();


        // Encaminha para o painel
        window.location.assign("painel.html");


    } catch (erro) {

        console.error("Erro no cadastro:", erro.code);


        // Conta criada, mas documento não registrado
        if (contaCriada) {

            mostrarMensagem(
                mensagemCadastro,
                "Sua conta foi criada, mas não foi possível concluir a inscrição. Não crie outra conta. Entre em contato com o suporte.",
                "erro"
            );

        } else if (erro.code === "auth/email-already-in-use") {

            mostrarMensagem(
                mensagemCadastro,
                "Este e-mail já está cadastrado. Utilize a opção de login.",
                "erro"
            );

        } else if (erro.code === "auth/weak-password") {

            mostrarMensagem(
                mensagemCadastro,
                "Escolha uma senha mais segura.",
                "erro"
            );

        } else if (erro.code === "auth/invalid-email") {

            mostrarMensagem(
                mensagemCadastro,
                "O endereço de e-mail informado é inválido.",
                "erro"
            );

        } else {

            mostrarMensagem(
                mensagemCadastro,
                "Não foi possível realizar o cadastro. Tente novamente.",
                "erro"
            );
        }

    } finally {

        botao.disabled = false;

        botao.textContent = "Cadastrar Interesse";
    }

});


// ============================================================
// 07 — LOGIN
// ============================================================

formLogin.addEventListener("submit", async (evento) => {

    evento.preventDefault();

    const email = document.getElementById("login-email")
        .value.trim();

    const senha = document.getElementById("login-senha").value;

    const botao = formLogin.querySelector(
        'button[type="submit"]'
    );


    botao.disabled = true;

    botao.textContent = "Entrando...";


    try {

        // Autentica o usuário
        await signInWithEmailAndPassword(
            auth,
            email,
            senha
        );


        mostrarMensagem(
            mensagemLogin,
            "Login realizado com sucesso!",
            "sucesso"
        );


        // Redireciona para o painel
        window.location.assign("painel.html");


    } catch (erro) {

        console.error("Erro no login:", erro.code);

        mostrarMensagem(
            mensagemLogin,
            "Não foi possível entrar. Confira seu e-mail e sua senha.",
            "erro"
        );

    } finally {

        botao.disabled = false;

        botao.textContent = "Entrar";
    }

});
