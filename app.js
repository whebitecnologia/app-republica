// ====== VARIÁVEIS GLOBAIS ======
let despesas = [];
const STORAGE_KEY = 'rep_despesas';

// ====== FUNÇÕES DE UTILIDADE ======
function popularSelectEstudantes() {
    const select = document.getElementById('inputResponsavel');
    if (!select) return;
    select.innerHTML = '';
    if (typeof estudantesPreCadastrados !== 'undefined') {
        estudantesPreCadastrados.forEach(est => {
            const opt = document.createElement('option');
            opt.value = est;
            opt.textContent = est;
            select.appendChild(opt);
        });
    }
}

function popularSelectDespesas() {
    // Preenche o datalist para sugestões, mas mantém input livre
    const datalist = document.getElementById('listaDespesas');
    if (!datalist) return;
    datalist.innerHTML = '';
    if (typeof despesasPreCadastradas !== 'undefined') {
        despesasPreCadastradas.forEach(desp => {
            const opt = document.createElement('option');
            opt.value = desp;
            datalist.appendChild(opt);
        });
    }
}

function salvarLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(despesas));
}

function carregarLocal() {
    const dados = localStorage.getItem(STORAGE_KEY);
    if (dados) despesas = JSON.parse(dados);
}

function atualizarTabelas() {
    atualizarTabelaDespesas();
    atualizarSelectsMes();
}

function atualizarTabelaDespesas() {
    const tbody = document.querySelector('#tabelaDespesas tbody');
    tbody.innerHTML = '';
    // Ordenar despesas por mês decrescente e depois por nome (opcional)
    const despesasOrdenadas = [...despesas].sort((a, b) => {
        // Mes no formato yyyy-mm
        if (a.mes > b.mes) return -1;
        if (a.mes < b.mes) return 1;
        // Opcional: ordenar por data de cadastro se houver, ou por nome
        return a.nome.localeCompare(b.nome);
    });
    despesasOrdenadas.forEach((d, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${d.nome}</td>
            <td>${parseFloat(d.valor).toFixed(2)}</td>
            <td>${d.responsavel}</td>
            <td>${d.mes}</td>
            <td>${d.descricao || ''}</td>
            <td><button class="btn btn-danger btn-sm" onclick="removerDespesa(${despesas.indexOf(d)})">Remover</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function atualizarSelectsMes() {
    const meses = [...new Set(despesas.map(d => d.mes))].sort().reverse();
    const selectFechamento = document.getElementById('selectMesFechamento');
    const selectHistorico = document.getElementById('selectMesHistorico');
    [selectFechamento, selectHistorico].forEach(sel => {
        sel.innerHTML = '';
        meses.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            sel.appendChild(opt);
        });
    });
    if (selectFechamento.value) mostrarFechamento(selectFechamento.value);
    if (selectHistorico.value) mostrarHistorico(selectHistorico.value);
}

function removerDespesa(idx) {
    if (confirm('Remover esta despesa?')) {
        despesas.splice(idx, 1);
        salvarLocal();
        atualizarTabelas();
    }
}

function limparDespesas() {
    if (confirm('Deseja realmente limpar todas as despesas?')) {
        despesas = [];
        salvarLocal();
        atualizarTabelas();
    }
}

// ====== EXPORTAÇÃO/IMPORTAÇÃO CSV ======
function exportarCSV() {
    if (despesas.length === 0) return alert('Sem despesas a exportar!');
    const header = 'nome,valor,responsavel,mes,descricao\n';
    const linhas = despesas.map(d => [d.nome, d.valor, d.responsavel, d.mes, d.descricao].map(v => '"'+String(v).replaceAll('"','""')+'"').join(','));
    const csv = header + linhas.join('\n');
    const blob = new Blob([csv], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'despesas_republica.csv';
    a.click();
    URL.revokeObjectURL(url);
}

function importarCSV(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const linhas = e.target.result.split(/\r?\n/).filter(l => l.trim());
        if (linhas.length < 2) return alert('Arquivo CSV inválido!');
        despesas = linhas.slice(1).map(l => {
            const m = l.match(/"([^"]*)"/g).map(s => s.replaceAll('"',''));
            return {nome: m[0], valor: parseFloat(m[1]), responsavel: m[2], mes: m[3], descricao: m[4]};
        });
        salvarLocal();
        atualizarTabelas();
    };
    reader.readAsText(file);
}

// ====== RATEIO E FECHAMENTO ======
function calcularFechamento(mes) {
    const despesasMes = despesas.filter(d => d.mes === mes);
    if (despesasMes.length === 0) return {total:0, rateio:[], detalhes:[]};
    // Sempre usar todos os estudantes cadastrados, mesmo que não tenham pago nada
    const moradores = (typeof estudantesPreCadastrados !== 'undefined' && estudantesPreCadastrados.length > 0)
        ? [...estudantesPreCadastrados]
        : [...new Set(despesasMes.map(d => d.responsavel))];
    const total = despesasMes.reduce((acc, d) => acc + parseFloat(d.valor), 0);
    const porPessoa = total / moradores.length;
    // Quanto cada um pagou
    const pagos = Object.fromEntries(moradores.map(m => [m, 0]));
    despesasMes.forEach(d => pagos[d.responsavel] += parseFloat(d.valor));
    // Diferença: positivo = tem a receber, negativo = deve
    const diffs = Object.fromEntries(moradores.map(m => [m, pagos[m] - porPessoa]));
    // Geração de transferências
    let transferencias = [];
    let devedores = moradores.filter(m => diffs[m] < -0.01).sort((a,b) => diffs[a]-diffs[b]);
    let credores = moradores.filter(m => diffs[m] > 0.01).sort((a,b) => diffs[b]-diffs[a]);
    let diffsCopy = {...diffs};
    for (let dev of devedores) {
        for (let cred of credores) {
            if (diffsCopy[dev] >= -0.01) break;
            if (diffsCopy[cred] <= 0.01) continue;
            let valor = Math.min(-diffsCopy[dev], diffsCopy[cred]);
            if (valor > 0.01) {
                transferencias.push({de: dev, para: cred, valor: valor});
                diffsCopy[dev] += valor;
                diffsCopy[cred] -= valor;
            }
        }
    }
    return {total, rateio: transferencias, detalhes: moradores.map(m => ({morador: m, pago: pagos[m], saldo: diffs[m]}))};
}

function mostrarFechamento(mes) {
    const res = calcularFechamento(mes);
    let html = `<h5>Total do mês: R$ ${res.total.toFixed(2)}</h5>`;
    html += '<ul class="list-group mb-3">';
    res.detalhes.forEach(d => {
        html += `<li class="list-group-item">${d.morador}: pagou R$ ${d.pago.toFixed(2)} | saldo: <b>${d.saldo > 0 ? '+' : ''}${d.saldo.toFixed(2)}</b></li>`;
    });
    html += '</ul>';
    if (res.rateio.length === 0) {
        html += '<div class="alert alert-success">Ninguém deve nada a ninguém neste mês!</div>';
    } else {
        html += '<h6>Transferências sugeridas:</h6><ul class="list-group">';
        res.rateio.forEach(t => {
            html += `<li class="list-group-item">${t.de} deve pagar <b>R$ ${t.valor.toFixed(2)}</b> para ${t.para}</li>`;
        });
        html += '</ul>';
    }
    document.getElementById('resumoFechamento').innerHTML = html;
}

function mostrarHistorico(mes) {
    const res = calcularFechamento(mes);
    let html = `<h5>Total do mês: R$ ${res.total.toFixed(2)}</h5>`;
    html += '<ul class="list-group mb-3">';
    res.detalhes.forEach(d => {
        html += `<li class="list-group-item">${d.morador}: pagou R$ ${d.pago.toFixed(2)} | saldo: <b>${d.saldo > 0 ? '+' : ''}${d.saldo.toFixed(2)}</b></li>`;
    });
    html += '</ul>';
    if (res.rateio.length === 0) {
        html += '<div class="alert alert-success">Ninguém devia nada neste mês!</div>';
    } else {
        html += '<h6>Transferências sugeridas:</h6><ul class="list-group">';
        res.rateio.forEach(t => {
            html += `<li class="list-group-item">${t.de} devia pagar <b>R$ ${t.valor.toFixed(2)}</b> para ${t.para}</li>`;
        });
        html += '</ul>';
    }
    document.getElementById('resumoHistorico').innerHTML = html;
}

// ====== EVENTOS ======
document.getElementById('formDespesa').onsubmit = function(e) {
    e.preventDefault();
    let nome = document.getElementById('inputNome').value.trim();
    const valor = parseFloat(document.getElementById('inputValor').value);
    let responsavel = document.getElementById('inputResponsavel').value.trim();
    const mes = document.getElementById('inputMes').value;
    const descricao = document.getElementById('inputDescricao').value.trim();
    if (!nome || !responsavel || !mes || isNaN(valor)) return alert('Preencha todos os campos obrigatórios!');
    despesas.push({nome, valor, responsavel, mes, descricao});
    salvarLocal();
    atualizarTabelas();
    this.reset();
    popularSelectEstudantes();
    popularSelectDespesas();
};

document.getElementById('btnExportar').onclick = exportarCSV;
document.getElementById('inputImportar').onchange = function() {
    if (this.files && this.files[0]) importarCSV(this.files[0]);
};
document.getElementById('btnLimpar').onclick = limparDespesas;
document.getElementById('selectMesFechamento').onchange = function() {
    mostrarFechamento(this.value);
};
document.getElementById('selectMesHistorico').onchange = function() {
    mostrarHistorico(this.value);
};

// ====== INICIALIZAÇÃO ======
carregarLocal();
atualizarTabelas();
popularSelectEstudantes();
popularSelectDespesas();
