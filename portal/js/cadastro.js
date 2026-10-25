
/* ============================================================
   COJURIS — CADASTRO E LOGIN

   Funcionalidades:
   1. Alternância entre cadastro e login
   2. Validação de e-mail Gmail
   3. Cadastro no Firebase Authentication
   4. Registro no Cloud Firestore
   5. Login de usuários cadastrados
   6. Verificação de permissão administrativa
   7. Redirecionamento automático
   8. Tratamento de erros
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
    getDoc,
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

    mensagemCadastro.classList.add("hidden");
    mensagemLogin.classList.add("hidden");
}


// Botões para alternar entre os formulários

document.querySelectorAll(".toggle-link").forEach((botao) => {

    botao.addEventListener("click", alternarFormularios);

});


// ============================================================
// 06 — IDENTIFICAÇÃO DO ADMINISTRADOR
// ============================================================

async function verificarAdministrador(usuario) {

    const adminRef = doc(
        db,
        "administradores",
        usuario.uid
    );

    const adminDoc = await getDoc(adminRef);

    return (
        adminDoc.exists() &&
        adminDoc.data().ativo === true
    );
}


// ============================================================
// 07 — REDIRECIONAMENTO POR PERFIL
// ============================================================

async function redirecionarUsuario(usuario) {

    const ehAdministrador = await verificarAdministrador(usuario);

    if (ehAdministrador) {

        console.log("COJURIS: administrador identificado.");

        window.location.replace("admin.html");

    } else {

        console.log("COJURIS: interessado identificado.");

        window.location.replace("painel.html");

    }
}


// ============================================================
// 08 — CADASTRO DE INTERESSADOS
// ============================================================

formCadastro.addEventListener("submit", async (evento) => {

    evento.preventDefault();


    // 8.1 — RECUPERAR OS DADOS

    const nome = document.getElementById("nome")
        .value.trim();

    const email = document.getElementById("email")
        .value.trim().toLowerCase();

    const oab = document.getElementById("oab")
        .value.trim();

    const senha = document.getElementById("senha").value;

    const botao = formCadastro.querySelector(
        'button[type="submit"]'
    );


    // 8.2 — VALIDAR OS CAMPOS

    if (!nome || !email || !oab || !senha) {

        mostrarMensagem(
            mensagemCadastro,
            "Preencha todos os campos obrigatórios.",
            "erro"
        );

        return;
    }


    // 8.3 — RESTRINGIR CADASTRO AO GMAIL

    if (!validarGmail(email)) {

        mostrarMensagem(
            mensagemCadastro,
            "Utilize um endereço @gmail.com para se cadastrar na COJURIS.",
            "erro"
        );

        return;
    }


    // 8.4 — VALIDAR A SENHA

    if (senha.length < 6) {

        mostrarMensagem(
            mensagemCadastro,
            "A senha deve conter pelo menos 6 caracteres.",
            "erro"
        );

        return;
    }


    // 8.5 — INICIAR O CADASTRO

    botao.disabled = true;
    botao.textContent = "Cadastrando...";

    let contaCriada = false;
    let registroGravado = false;


    try {

        // Criar usuário no Firebase Authentication

        const credencial = await createUserWithEmailAndPassword(
            auth,
            email,
            senha
        );

        contaCriada = true;

        const usuario = credencial.user;


        // Gravar informações no Firestore

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

        registroGravado = true;


        // Confirmar cadastro

        mostrarMensagem(
            mensagemCadastro,
            "Sua manifestação de interesse foi registrada com sucesso!",
            "sucesso"
        );


        // Limpar formulário

        formCadastro.reset();


        // Novo interessado acessa o painel individual

        window.location.replace("painel.html");


    } catch (erro) {

        console.error("Erro no cadastro:", erro);


        if (contaCriada && !registroGravado) {

            mostrarMensagem(
                mensagemCadastro,
                "Sua conta foi criada, mas não foi possível concluir a inscrição. Entre em contato com o suporte.",
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
                "A senha informada é muito fraca.",
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
// 09 — LOGIN COM IDENTIFICAÇÃO ADMINISTRATIVA
// ============================================================

formLogin.addEventListener("submit", async (evento) => {

    evento.preventDefault();


    // 9.1 — RECUPERAR CREDENCIAIS

    const email = document.getElementById("login-email")
        .value.trim();

    const senha = document.getElementById("login-senha").value;

    const botao = formLogin.querySelector(
        'button[type="submit"]'
    );


    // 9.2 — INICIAR AUTENTICAÇÃO

    botao.disabled = true;
    botao.textContent = "Entrando...";


    try {

        // Autenticar usuário

        const credencial = await signInWithEmailAndPassword(
            auth,
            email,
            senha
        );

        const usuario = credencial.user;


        // Confirmar autenticação

        mostrarMensagem(
            mensagemLogin,
            "Login realizado com sucesso!",
            "sucesso"
        );


        // Verificar perfil e redirecionar

        await redirecionarUsuario(usuario);


    } catch (erro) {

        console.error("Erro no login:", erro);


        if (
            erro.code === "auth/invalid-credential" ||
            erro.code === "auth/wrong-password" ||
            erro.code === "auth/user-not-found"
        ) {

            mostrarMensagem(
                mensagemLogin,
                "E-mail ou senha incorretos.",
                "erro"
            );

        } else if (erro.code === "permission-denied") {

            mostrarMensagem(
                mensagemLogin,
                "Login efetuado, mas não foi possível verificar suas permissões.",
                "erro"
            );

        } else {

            mostrarMensagem(
                mensagemLogin,
                "Não foi possível concluir o acesso. Verifique sua conexão ou tente novamente.",
                "erro"
            );
        }

    } finally {

        botao.disabled = false;
        botao.textContent = "Entrar";
    }

});
