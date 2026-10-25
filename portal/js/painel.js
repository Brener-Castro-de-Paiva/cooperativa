/* COJURIS — PAINEL DO COOPERADO */

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// 1. Verifica se o usuário está logado
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Usuário logado! Vamos buscar os dados dele no Firestore.
        try {
            const docRef = doc(db, "interessados", user.uid);
            const docSnap = await getDoc(docRef);

            const painelConteudo = document.getElementById("painel-conteudo");
            
            if (docSnap.exists()) {
                const dados = docSnap.data();
                painelConteudo.innerHTML = `
                    <h1>Bem-vindo(a), ${dados.nome.split(' ')[0]}</h1>
                    <p class="intro">Sua manifestação de interesse está registrada em nosso sistema.</p>
                    
                    <div class="status-box">
                        <strong>Status atual:</strong> 
                        <span class="badge ${dados.status}">${dados.status.toUpperCase()}</span>
                    </div>

                    <p style="margin-top: 20px; font-size: 0.9rem; color: #666;">
                        Nossa equipe analisará seu perfil. Acompanhe seu e-mail para novidades.
                    </p>

                    <button id="btn-sair" class="btn-form" style="margin-top: 30px; background: #f8d7da; color: #721c24;">Sair do Portal</button>
                `;

                // Adiciona o evento de logout no botão que acabamos de criar
                document.getElementById("btn-sair").addEventListener("click", async () => {
                    await signOut(auth);
                    window.location.href = "index.html";
                });

            } else {
                painelConteudo.innerHTML = `<h1>Erro</h1><p>Cadastro não encontrado no banco de dados.</p>`;
            }
        } catch (error) {
            console.error("Erro ao buscar dados:", error);
        }
    } else {
        // Usuário NÃO está logado. Expulsa para a tela de login.
        window.location.href = "index.html";
    }
});