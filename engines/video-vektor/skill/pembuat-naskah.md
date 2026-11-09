# Hierarchical Dynamic Discourse Engagement Model (HDDEM)

**Hierarchical Dynamic Discourse Engagement Model (HDDEM)** merupakan model matematis konseptual untuk memprediksi dan mengoptimalkan keterlibatan audiens terhadap wacana naratif, edukatif, argumentatif, dan informatif melalui integrasi perhatian awal, respons afektif, humor kontekstual, daya tarik informasi lokal, perkembangan konteks global, nilai marginal informasi, pemrosesan temporal multiskala, optimasi durasi, spesifikasi material visual, perkembangan keadaan visual, optimasi transisi antarmaterial, keselarasan multimodal, struktur narasi, dan koherensi wacana. Model ini mengintegrasikan optimasi narasi dan representasi visual secara hierarkis, dengan parameter yang memerlukan kalibrasi dan validasi empiris.

## Formulasi Matematis

**1. Initial Engagement**

H(k) = exp(−η(k−1)) × (αQ(k) + βD(k) + γR(k) + δA(k))

H(k) = keterlibatan awal; k = indeks unit informasi; Q(k) = kesenjangan informasi; D(k) = ketidaksesuaian ekspektasi; R(k) = relevansi audiens; A(k) = intensitas emosional; α, β, γ, δ = koefisien pengaruh; η = parameter peluruhan posisi.

**2. Affective Engagement**

F(k) = Σ[i=1 hingga n] v(i)e(i,k) + Σ[i<j] κ(i,j)e(i,k)e(j,k)

F(k) = kontribusi afektif; e(i,k) = intensitas dimensi afektif ke-i pada unit ke-k; n = jumlah dimensi afektif; v(i) = bobot dimensi afektif; κ(i,j) = koefisien interaksi antardimensi. Dimensi afektif mencakup kesenangan, kekaguman, empati, ketegangan, dan kepuasan.

**3. Contextual Humor Engagement**

Hᵤ(k) = αₕIₕ(k) + βₕRₕ(k) + γₕCₕ(k) + δₕTₕ(k) − λₕDₕ(k) − μₕPₕ(k)

Hᵤ(k) = kontribusi humor kontekstual; Iₕ(k) = ketidaksesuaian lucu; Rₕ(k) = keterpahaman humor; Cₕ(k) = relevansi kontekstual; Tₕ(k) = ketepatan penempatan; Dₕ(k) = gangguan pemahaman; Pₕ(k) = risiko ketidaksesuaian; αₕ, βₕ, γₕ, δₕ, λₕ, μₕ = koefisien pengaruh.

**4. Local Engagement**

L(k) = fθ(X(k), S(k−1), F(k), Hᵤ(k))

L(k) = daya tarik lokal; X(k) = representasi unit informasi; S(k−1) = kondisi kontekstual sebelumnya; F(k) = kontribusi afektif; Hᵤ(k) = kontribusi humor; θ = parameter fungsi pembelajaran lokal.

**5. Marginal Information Value**

M(k) = ΔV(k) − ρU(k)

M(k) = nilai marginal informasi; ΔV(k) = peningkatan nilai informasi atau pemahaman; U(k) = redundansi informasi; ρ = koefisien penalti redundansi.

**6. Contextual State Update**

S(k) = fφ(S(k−1), X(k), L(k), M(k), F(k), Hᵤ(k))

S(k) = kondisi kontekstual terkini; S(k−1) = kondisi sebelumnya; X(k) = unit informasi; L(k) = daya tarik lokal; M(k) = nilai marginal informasi; F(k) = kontribusi afektif; Hᵤ(k) = kontribusi humor; φ = parameter pembaruan konteks.

**7. Global Contextual Engagement**

G(k) = gφ(S(k))

G(k) = keterlibatan kontekstual global; S(k) = kondisi kontekstual terkini; gφ = fungsi pemetaan konteks.

**8. Multiscale Temporal Engagement**

E(t) = sigmoid(b + Σ[j=1 hingga m] w(j) × Tτ(j)(L, G, M, F, Hᵤ, t) + ωH(t))

E(t) = prediksi keterlibatan pada waktu t; t = waktu dalam detik; sigmoid = fungsi aktivasi dengan keluaran 0–1; b = bias; m = jumlah jendela temporal; w(j) = bobot jendela; Tτ(j) = fungsi integrasi temporal pada jendela berdurasi τ(j); L = daya tarik lokal; G = keterlibatan global; M = nilai marginal; F = kontribusi afektif; Hᵤ = kontribusi humor; H(t) = keterlibatan awal yang dipetakan ke waktu; ω = bobot keterlibatan awal.

**9. Optimal Duration**

T* = argmax[T ∈ D] {∫[0 hingga T] E(t)dt − λT + μC(T) − ξU(T)}

T* = durasi optimal; T = durasi dalam detik; D = himpunan kandidat durasi; E(t) = keterlibatan temporal; λ = penalti durasi; C(T) = kelengkapan informasi; μ = bobot kelengkapan; U(T) = redundansi kumulatif; ξ = penalti redundansi.

**10. Hierarchical Visual Material and Transition Model (HVMTM)**

**10A. Visual Material Specification**

V(k) = {(oᵢ, aᵢ, rᵢ, pᵢ)}[i=1 hingga n(k)]

V(k) = spesifikasi material visual pada unit ke-k; oᵢ = identitas objek atau material; aᵢ = atribut dan detail objek; rᵢ = hubungan dengan material lain; pᵢ = peran dan cara penyajian; n(k) = jumlah material yang diperlukan. Material dapat berupa objek, ilustrasi, diagram, teks, angka, simbol, atau representasi informasi lainnya sesuai kebutuhan pemahaman.

**10B. Visual State Evolution**

Sᵥ(k,j+1) = fᵥ(Sᵥ(k,j), Aᵥ(k,j), X(k))

Sᵥ(k,j) = keadaan visual pada tahap ke-j dalam unit ke-k; Aᵥ(k,j) = tindakan atau perubahan keadaan material; X(k) = informasi naratif; fᵥ = fungsi pembaruan keadaan visual. Satu unit narasi dapat memiliki beberapa tahap visual dengan perubahan objek, atribut, hubungan, atau susunan material.

**10C. Visual Transition Optimization**

Tᵥ*(a→b) = argmax[T ∈ Aᵥ(a,b)] {αᵥC(T) + βᵥS(T) + γᵥI(T) − δᵥD(T) − εᵥB(T)}

Tᵥ*(a→b) = transisi visual optimal dari keadaan a ke b; Aᵥ(a,b) = himpunan kandidat transisi; C(T) = kontinuitas objek dan konteks; S(T) = kesesuaian semantik; I(T) = kontribusi informasi; D(T) = diskontinuitas yang tidak diperlukan; B(T) = beban kognitif; αᵥ, βᵥ, γᵥ, δᵥ, εᵥ = koefisien pengaruh. Transisi mencakup mempertahankan, menambahkan, menghilangkan, mengganti, atau mengubah keadaan material, baik di dalam satu unit maupun antarunit narasi.

**10D. Detailed Motion Description Optimization**

Z*(k) = argmax[Z ∈ Aₘ(k)] {w₁Sₘ(Z,X(k)) + w₂Iₘ(Z) + w₃Dₘ(Z,V(k)) + w₄Cₘ(Z,Tᵥ*) − w₅Bₘ(Z) − w₆Rₘ(Z)}

Z*(k) = deskripsi visual optimal; Aₘ(k) = himpunan kandidat deskripsi; Sₘ = kesesuaian semantik; Iₘ = nilai informasi visual; Dₘ = kelengkapan detail material; Cₘ = kesinambungan dan kejelasan transisi; Bₘ = beban kognitif; Rₘ = redundansi visual; w₁–w₆ = bobot optimasi. Deskripsi memuat material, atribut, hubungan, tahapan penyajian, perubahan keadaan, serta transisi secara terperinci sesuai kebutuhan informasi, tanpa menentukan teknik animasi, perangkat lunak, atau gaya produksi.

**11. Multimodal Alignment Evaluation**

J(k) = uSₐᵥ(k) + vCᵥ(k) + wTₛ(k) + zHₛ(k) − xOᵥ(k) − yBₜ(k)

J(k) = keselarasan multimodal; Sₐᵥ(k) = keselarasan audio-visual; Cᵥ(k) = kontribusi visual terhadap pemahaman; Tₛ(k) = keselarasan temporal; Hₛ(k) = keselarasan humor verbal-visual; Oᵥ(k) = kelebihan informasi visual; Bₜ(k) = beban perhatian; u, v, w, z, x, y = koefisien pengaruh.

**12. Narrative Structure Constraint**

P = (Hₙ, Rₙ, τ₁, Sₙ, τ₂, Bₙ, Cₙ, K₁, K₂)

τ₁ = τ₂ = 0,7 detik

N(Rₙ) = N(Sₙ) = N(K₁) = N(K₂) = 1

K₁ = "Berikan ide atau masukan kalian di kolom komentar."

K₂ = "Terima kasih."

P = urutan struktur narasi; Hₙ = hook; Rₙ = transisi retoris singkat; τ₁ = jeda setelah transisi retoris; Sₙ = ajakan subscribe; τ₂ = jeda setelah subscribe; Bₙ = pembahasan utama; Cₙ = kesimpulan substantif; K₁ dan K₂ = kalimat penutup; N = jumlah kalimat pada komponen terkait. Ajakan subscribe hanya muncul pada Sₙ.

**13. Narrative Coherence Constraint**

Cₕ = Sₕ(Bₙ,Hₙ) + Rₕ(Cₙ,Bₙ) − λₕDₙ(X)

Cₕ ≥ θₕ

Cₕ = koherensi narasi; Sₕ(Bₙ,Hₙ) = tingkat penyelesaian kesenjangan informasi hook oleh pembahasan utama; Rₕ(Cₙ,Bₙ) = relevansi kesimpulan terhadap pembahasan; Dₙ(X) = ketidaksinambungan antarunit informasi; λₕ = penalti ketidaksinambungan; θₕ = ambang koherensi minimum. Narasi harus dapat dipahami secara mandiri tanpa ketergantungan pada material visual.

**14. Cross-Unit Visual Continuity Constraint**

Cᵥ(k) = α꜀Pᵥ(k) + β꜀Rᵥ(k) + γ꜀Tᵥ(k) − δ꜀Dᵥ(k)

Cᵥ(k) ≥ θᵥ

Cᵥ(k) = kesinambungan visual antarunit narasi; Pᵥ(k) = konsistensi identitas dan atribut material yang dipertahankan; Rᵥ(k) = kesinambungan hubungan antarmaterial; Tᵥ(k) = kesesuaian transisi dari unit sebelumnya; Dᵥ(k) = diskontinuitas visual yang tidak diperlukan; α꜀, β꜀, γ꜀, δ꜀ = koefisien pengaruh; θᵥ = ambang kesinambungan minimum. Pergantian material tidak diwajibkan pada setiap kalimat, sedangkan satu kalimat dapat memerlukan beberapa material, keadaan, atau tahapan transisi.

## Ketentuan Input dan Output

Input berupa **Tema: [judul]** yang diproses berdasarkan formulasi matematis HDDEM. Output berupa satu array JSON valid tanpa objek pembungkus, dengan setiap elemen mewakili tepat satu kalimat dan memiliki dua properti berurutan: **"audio_text"** = kalimat narasi lengkap untuk TTS tanpa instruksi teknis; **"motion_description"** = deskripsi terperinci mengenai material visual, cara penyajian, perkembangan keadaan, dan transisi berdasarkan HVMTM. Teks, angka, atau label visual apabila diperlukan menjadi bagian dari **"motion_description"**, bukan properti terpisah. Instruksi jeda hening sesuai kendala struktur narasi dicantumkan dalam **"motion_description"** elemen terkait, bukan dalam **"audio_text"**, tanpa membuat elemen tambahan. Output menggunakan tanda kutip ganda yang valid, tanpa komentar, koma berlebih, metadata, atau teks di luar array JSON.

**Tema: [masukkan judul di sini]**
