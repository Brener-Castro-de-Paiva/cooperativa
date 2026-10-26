
/* ============================================================
   COJURIS — CADASTRO, LOGIN E RECUPERAÇÃO DE SENHA

   Funcionalidades:
   1. Cadastro simplificado sem número da OAB
   2. Declaração profissional obrigatória
   3. Restrição de novos cadastros ao Gmail
   4. Integração com Firebase Authentication
   5. Registro de interessados no Cloud Firestore
   6. Identificação de administradores
   7. Redirecionamento automático por perfil
   8. Recuperação de senha
   9. Tratamento de erros
   ============================================================ */


// ============================================================
// 01 — IMPORTAÇÃO DOS MÓDULOS
// ============================================================

import { auth, db } from "./firebase-config.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail
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

const mensagemCadastro = document.getElementById(
    "mensagem-cadastro"
);

const mensagemLogin = document.getElementById(
    "mensagem-login"
);

const botaoRecuperar = document.getElementById(
    "esqueci-senha"
);


// ============================================================
// 03 — FUNÇÕES AUXILIARES
// ============================================================

// Validar o domínio Gmail

function validarGmail(email) {

    const regex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;

    return regex.test(email);
}


// Exibir mensagens

function mostrarMensagem(elemento, texto, tipo) {

    if (!elemento) return;

    elemento.textContent = texto;

    elemento.className = `mensagem ${tipo}`;

    elemento.setAttribute("role", "alert");
}


// Limpar mensagens anteriores

function limparMensagem(elemento) {

    if (!elemento) return;

    elemento.textContent = "";

    elemento.className = "mensagem hidden";
}


// ============================================================
// 04 — ALTERNÂNCIA ENTRE CADASTRO E LOGIN
// ============================================================

document.querySelectorAll(".toggle-link").forEach((botao) => {

    botao.addEventListener("click", () => {

        if (!cadastroBox || !loginBox) return;

        cadastroBox.classList.toggle("hidden");

        loginBox.classList.toggle("hidden");

        limparMensagem(mensagemCadastro);

        limparMensagem(mensagemLogin);
    });

});


// ============================================================
// 05 — VERIFICAÇÃO DO ADMINISTRADOR
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
// 06 — REDIRECIONAMENTO POR PERFIL
// ============================================================

async function redirecionarUsuario(usuario) {

    const ehAdministrador = await verificarAdministrador(
        usuario
    );

    if (ehAdministrador) {

        console.info("COJURIS: acesso administrativo.");

        window.location.replace("admin.html");

    } else {

        console.info("COJURIS: acesso do interessado.");

        window.location.replace("painel.html");
    }
}


// ============================================================
// 07 — CADASTRO DE NOVOS INTERESSADOS
// ============================================================

if (formCadastro) {

    formCadastro.addEventListener(
        "submit",
        async (evento) => {

            evento.preventDefault();


            // --------------------------------------------
            // 7.1 — RECUPERAR OS DADOS
            // --------------------------------------------

            const nome = document.getElementById("nome")
                .value.trim();

            const email = document.getElementById("email")
                .value.trim().toLowerCase();

            const senha = document.getElementById("senha")
                .value;

            const campoDeclaracao = document.getElementById(
                "declaracao-advogado"
            );

            const declaracaoAceita =
                campoDeclaracao?.checked === true;

            const botao = formCadastro.querySelector(
                'button[type="submit"]'
            );


            // --------------------------------------------
            // 7.2 — LIMPAR MENSAGENS
            // --------------------------------------------

            limparMensagem(mensagemCadastro);


            // --------------------------------------------
            // 7.3 — VALIDAR PREENCHIMENTO
            // --------------------------------------------

            if (!nome || !email || !senha) {

                mostrarMensagem(
                    mensagemCadastro,
                    "Preencha todos os campos obrigatórios.",
                    "erro"
                );

                return;
            }


            // --------------------------------------------
            // 7.4 — VALIDAR NOME
            // --------------------------------------------

            if (nome.length > 150) {

                mostrarMensagem(
                    mensagemCadastro,
                    "O nome informado ultrapassa o limite de 150 caracteres.",
                    "erro"
                );

                return;
            }


            // --------------------------------------------
            // 7.5 — VALIDAR GMAIL
            // --------------------------------------------

            if (!validarGmail(email)) {

                mostrarMensagem(
                    mensagemCadastro,
                    "Para se cadastrar na COJURIS, utilize um endereço @gmail.com.",
                    "erro"
                );

                return;
            }


            // --------------------------------------------
            // 7.6 — VALIDAR SENHA
            // --------------------------------------------

            if (senha.length < 6) {

                mostrarMensagem(
                    mensagemCadastro,
                    "A senha deve conter pelo menos 6 caracteres.",
                    "erro"
                );

                return;
            }


            // --------------------------------------------
            // 7.7 — VALIDAR DECLARAÇÃO PROFISSIONAL
            // --------------------------------------------

            if (!declaracaoAceita) {

                mostrarMensagem(
                    mensagemCadastro,
                    "Para continuar, confirme a declaração de que você é advogado(a) regularmente inscrito(a) na OAB.",
                    "erro"
                );

                campoDeclaracao?.focus();

                return;
            }


            // --------------------------------------------
            // 7.8 — INICIAR O CADASTRO
            // --------------------------------------------

            if (botao.disabled) return;

            botao.disabled = true;

            botao.textContent = "Cadastrando...";

            let contaCriada = false;
            let registroGravado = false;


            try {

                // Criar conta no Firebase Authentication

                const credencial =
                    await createUserWithEmailAndPassword(
                        auth,
                        email,
                        senha
                    );

                const usuario = credencial.user;

                contaCriada = true;


                // ----------------------------------------
                // 7.9 — REGISTRAR INTERESSE NO FIRESTORE
                // ----------------------------------------

                await setDoc(
                    doc(db, "interessados", usuario.uid),
                    {
                        nome: nome,

                        email: email,

                        declaracaoAdvogado: true,

                        versaoDeclaracao: "1.0",

                        dataDeclaracao: serverTimestamp(),

                        verificacaoProfissional:
                            "nao_verificada",

                        status: "pendente",

                        dataCadastro: serverTimestamp()
                    }
                );

                registroGravado = true;


                // ----------------------------------------
                // 7.10 — CONFIRMAR CADASTRO
                // ----------------------------------------

                mostrarMensagem(
                    mensagemCadastro,
                    "Sua manifestação de interesse foi registrada com sucesso!",
                    "sucesso"
                );

                formCadastro.reset();


                // Abrir painel individual

                window.location.replace("painel.html");


            } catch (erro) {

                console.error(
                    "COJURIS — Erro no cadastro:",
                    erro.code || erro.message
                );

                let texto =
                    "Não foi possível realizar o cadastro. Tente novamente.";


                // Conta criada, mas Firestore não concluiu

                if (contaCriada && !registroGravado) {

                    texto =
                        "Sua conta foi criada, mas a inscrição " +
                        "não foi concluída. Não crie outra conta. " +
                        "Entre em contato com o suporte.";

                } else if (
                    erro.code === "auth/email-already-in-use"
                ) {

                    texto =
                        "Este e-mail já está cadastrado. " +
                        "Utilize a opção de login.";

                } else if (
                    erro.code === "auth/weak-password"
                ) {

                    texto =
                        "A senha é muito fraca. " +
                        "Escolha uma senha mais segura.";

                } else if (
                    erro.code === "auth/invalid-email"
                ) {

                    texto =
                        "O endereço de e-mail informado é inválido.";

                } else if (
                    erro.code === "permission-denied"
                ) {

                    texto =
                        "O cadastro não foi autorizado pelo banco " +
                        "de dados. Verifique as regras do Firestore.";
                }


                mostrarMensagem(
                    mensagemCadastro,
                    texto,
                    "erro"
                );

            } finally {

                botao.disabled = false;

                botao.textContent = "Cadastrar Interesse";
            }

        }
    );
}


// ============================================================
// 08 — LOGIN COM IDENTIFICAÇÃO ADMINISTRATIVA
// ============================================================

if (formLogin) {

    formLogin.addEventListener(
        "submit",
        async (evento) => {

            evento.preventDefault();


            // --------------------------------------------
            // 8.1 — RECUPERAR CREDENCIAIS
            // --------------------------------------------

            const email = document.getElementById(
                "login-email"
            ).value.trim();

            const senha = document.getElementById(
                "login-senha"
            ).value;

            const botao = formLogin.querySelector(
                'button[type="submit"]'
            );


            // --------------------------------------------
            // 8.2 — INICIAR LOGIN
            // --------------------------------------------

            if (botao.disabled) return;

            botao.disabled = true;

            botao.textContent = "Entrando...";

            limparMensagem(mensagemLogin);


            try {

                // Autenticar usuário

                const credencial =
                    await signInWithEmailAndPassword(
                        auth,
                        email,
                        senha
                    );


                // Verificar permissões e redirecionar

                await redirecionarUsuario(
                    credencial.user
                );


            } catch (erro) {

                console.error(
                    "COJURIS — Erro no login:",
                    erro.code || erro.message
                );


                let texto =
                    "Não foi possível concluir o acesso. " +
                    "Verifique sua conexão ou tente novamente.";


                const credenciaisInvalidas = [
                    "auth/invalid-credential",
                    "auth/wrong-password",
                    "auth/user-not-found"
                ];


                if (
                    credenciaisInvalidas.includes(erro.code)
                ) {

                    texto = "E-mail ou senha incorretos.";

                } else if (
                    erro.code === "permission-denied"
                ) {

                    texto =
                        "Autenticação realizada, mas não foi " +
                        "possível verificar suas permissões.";
                }


                mostrarMensagem(
                    mensagemLogin,
                    texto,
                    "erro"
                );

            } finally {

                botao.disabled = false;

                botao.textContent = "Entrar";
            }

        }
    );
}


// ============================================================
// 09 — RECUPERAÇÃO DE SENHA
// ============================================================

if (botaoRecuperar) {

    botaoRecuperar.addEventListener(
        "click",
        async () => {

            const campoEmail = document.getElementById(
                "login-email"
            );

            const email = campoEmail.value
                .trim()
                .toLowerCase();


            // --------------------------------------------
            // 9.1 — VALIDAR E-MAIL
            // --------------------------------------------

            if (!email || !campoEmail.checkValidity()) {

                mostrarMensagem(
                    mensagemLogin,
                    "Informe seu e-mail cadastrado para recuperar a senha.",
                    "erro"
                );

                campoEmail.focus();

                return;
            }


            // --------------------------------------------
            // 9.2 — SOLICITAR RECUPERAÇÃO
            // --------------------------------------------

            botaoRecuperar.disabled = true;

            botaoRecuperar.textContent = "Enviando...";

            limparMensagem(mensagemLogin);


            try {

                // Configurar idioma da mensagem

                auth.languageCode = "pt-BR";


                // Solicitar e-mail de recuperação

                await sendPasswordResetEmail(
                    auth,
                    email
                );


                // Resposta sem revelar existência da conta

                mostrarMensagem(
                    mensagemLogin,
                    "Se existir uma conta vinculada a este " +
                    "e-mail, você receberá instruções para " +
                    "redefinir sua senha. Verifique também o spam.",
                    "sucesso"
                );


            } catch (erro) {

                console.error(
                    "COJURIS — Recuperação de senha:",
                    erro.code || erro.message
                );

                mostrarMensagem(
                    mensagemLogin,
                    "Não foi possível processar sua solicitação. " +
                    "Tente novamente mais tarde.",
                    "erro"
                );

            } finally {

                botaoRecuperar.disabled = false;

                botaoRecuperar.textContent =
                    "Esqueci minha senha";
            }

        }
    );
}
