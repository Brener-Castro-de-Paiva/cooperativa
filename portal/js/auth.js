/* COJURIS — AUTENTICAÇÃO */

import { auth } from "./firebase-config.js";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

// Criar conta
export async function criarConta(email, senha) {
    return await createUserWithEmailAndPassword(auth, email, senha);
}

// Entrar no portal
export async function entrar(email, senha) {
    return await signInWithEmailAndPassword(auth, email, senha);
}

// Encerrar sessão
export async function sair() {
    await signOut(auth);
}