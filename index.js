const { 
    Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const mongoose = require('mongoose');
const Registro = require('./models/Registro');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildMessages
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// --- CONFIGURAÇÕES DE IDS ---
const CONFIG = {
    CANAL_PAINEL_REGISTRO: "1472997423197454468",
    CANAL_LOGS_STAFF: "1472997423789113409",
    CANAL_CONFIG_ADM: "1472997423789113408",
    CARGOS: {
        "1": { id: "1472997422786674844", nome: "Ajudante", setor: "Suporte" },
        "2": { id: "1472997422786674845", nome: "Moderador(a)", setor: "Segurança" },
        "3": { id: "1472997422786674846", nome: "Administrador(a)", setor: "Segurança" },
        "4": { id: "1472997422786674847", nome: "Auxiliar", setor: "Superior" },
        "5": { id: "1472997422786674848", nome: "Coordenador(a)", setor: "Superior" },
        "6": { id: "1472997422786674848", nome: "Direção", setor: "Superior" }
    }
};

// --- CONEXÃO MONGODB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Conectado ao MongoDB Atlas"))
    .catch(err => console.error("❌ Erro ao conectar ao MongoDB:", err));

// --- TRATAMENTO DE ERROS GLOBAIS ---
process.on('unhandledRejection', error => console.error('Erro não tratado:', error));

client.once('ready', () => {
    console.log(`🤖 Bot ${client.user.tag} online no Horizonte Roleplay!`);
});

client.on('interactionCreate', async (interaction) => {
    try {
        // --- COMANDO /PAINEL ---
        if (interaction.isChatInputCommand() && interaction.commandName === 'painel') {
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('📋 SISTEMA DE REGISTRO')
                .setDescription('Bem-vindo ao sistema de registro do servidor!\n\nSelecione o cargo correspondente ao seu setor.\n\n⚠️ **Usar cargo incorreto pode causar penalidades.**')
                .setFooter({ text: 'Horizonte Roleplay' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('iniciar_registro')
                    .setLabel('Registrar-se')
                    .setEmoji('📋')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }

        // --- BOTÃO INICIAR REGISTRO ---
        if (interaction.isButton() && interaction.customId === 'iniciar_registro') {
            const userReg = await Registro.findOne({ userId: interaction.user.id, status: 'PENDENTE' });
            if (userReg) return interaction.reply({ content: "❌ Você já possui um registro pendente!", ephemeral: true });

            const modal = new ModalBuilder()
                .setCustomId('modal_registro')
                .setTitle('Registro de Membro');

            const nickInput = new TextInputBuilder()
                .setCustomId('nick')
                .setLabel('NICK')
                .setPlaceholder('Nome do personagem')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const cargoInput = new TextInputBuilder()
                .setCustomId('cargo')
                .setLabel('CARGO (1 a 3)')
                .setPlaceholder('1-Ajudante, 2-Mod, 3-Adm')
                .setMaxLength(1)
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(nickInput),
                new ActionRowBuilder().addComponents(cargoInput)
            );

            await interaction.showModal(modal);
        }

        // --- RECEBIMENTO DO MODAL ---
        if (interaction.isModalSubmit() && interaction.customId === 'modal_registro') {
            await interaction.deferReply({ ephemeral: true });

            const nick = interaction.fields.getTextInputValue('nick');
            const cargoNum = interaction.fields.getTextInputValue('cargo');

            if (!['1','2','3'].includes(cargoNum)) 
                return interaction.editReply("❌ Cargo inválido! Use apenas 1, 2 ou 3.");

            const novoRegistro = await Registro.findOneAndUpdate(
                { userId: interaction.user.id },
                { nick, cargoNum, status: 'PENDENTE', $inc: { tentativas: 1 } },
                { upsert: true, new: true }
            );

            if (novoRegistro.tentativas > 3) 
                return interaction.editReply("❌ Limite de 3 tentativas excedido.");

            const canalStaff = client.channels.cache.get(CONFIG.CANAL_LOGS_STAFF);
            const embedStaff = new EmbedBuilder()
                .setTitle('📥 NOVO REGISTRO')
                .setThumbnail(interaction.user.displayAvatarURL())
                .addFields(
                    { name: '👤 Usuário', value: `${interaction.user.tag} (${interaction.user.id})` },
                    { name: '📝 Nick', value: nick },
                    { name: '💼 Cargo', value: CONFIG.CARGOS[cargoNum].nome },
                    { name: '📅 Data', value: new Date().toLocaleString('pt-BR') }
                )
                .setColor('Blue');

            const botoesStaff = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`aceitar_${interaction.user.id}`).setLabel('Aceitar').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`recusar_${interaction.user.id}`).setLabel('Recusar').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`editar_${interaction.user.id}`).setLabel('Editar').setStyle(ButtonStyle.Primary)
            );

            const msgStaff = await canalStaff.send({ embeds: [embedStaff], components: [botoesStaff] });
            novoRegistro.mensagemPainelId = msgStaff.id;
            await novoRegistro.save();

            await interaction.editReply("✅ Seu formulário foi enviado para análise!");
        }

        // --- BOTÕES DE STAFF ---
        if (interaction.isButton() && (interaction.customId.startsWith('aceitar_') || interaction.customId.startsWith('recusar_'))) {
            const [acao, targetId] = interaction.customId.split('_');
            const admin = interaction.member;
            if (admin.id === targetId) return interaction.reply({ content: "❌ Você não pode processar seu próprio registro.", ephemeral: true });

            const registro = await Registro.findOne({ userId: targetId });
            const targetMember = await interaction.guild.members.fetch(targetId);

            if (acao === 'aceitar') {
                const cargoId = CONFIG.CARGOS[registro.cargoNum].id;
                const nickFormatado = `『Ⓗ¹』${registro.nick}`;
                await targetMember.roles.add(cargoId);
                await targetMember.setNickname(nickFormatado).catch(() => console.log("Erro ao mudar nick"));

                registro.status = 'APROVADO';
                await registro.save();

                const embedDM = new EmbedBuilder().setTitle('✅ REGISTRO APROVADO').setColor('Green').setTimestamp();
                if (['2','3'].includes(registro.cargoNum)) 
                    embedDM.setDescription(`Prezado(a), seu acesso ao **Setor Segurança** foi liberado.`);
                else 
                    embedDM.setDescription(`Prezado(a), seu acesso ao **Setor Suporte** foi liberado.`);
                
                await targetMember.send({ embeds: [embedDM] }).catch(() => null);
                await interaction.update({ content: `✅ Registro de <@${targetId}> aprovado por ${admin.user.tag}`, embeds: [], components: [] });
            }

            if (acao === 'recusar') {
                registro.status = 'RECUSADO';
                await registro.save();

                const embedRecusa = new EmbedBuilder()
                    .setTitle('❌ REGISTRO RECUSADO')
                    .setColor('Red')
                    .setDescription(`Status atual: ${registro.tentativas}/3 tentativas utilizadas.`)
                    .setFooter({ text: 'Horizonte Roleplay' });

                await targetMember.send({ embeds: [embedRecusa] }).catch(() => null);
                await interaction.update({ content: `❌ Registro de <@${targetId}> recusado por ${admin.user.tag}`, embeds: [], components: [] });
            }
        }

    } catch (error) {
        console.error(error);
        if (!interaction.replied) await interaction.reply({ content: "Ocorreu um erro ao processar sua solicitação.", ephemeral: true });
    }
});

client.login(process.env.TOKEN);
