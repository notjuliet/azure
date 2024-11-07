import {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  SlashCommandBuilder,
} from "discord.js";
import { XRPC, CredentialManager } from "@atcute/client";
import "@atcute/bluesky/lexicons";
import { REST, Routes } from "discord.js";

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName("profile")
      .setDescription("Profile of a Bluesky user")
      .addStringOption((option) =>
        option
          .setName("actor")
          .setDescription("Handle or DID")
          .setRequired(true),
      ),
  },
  {
    data: new SlashCommandBuilder()
      .setName("did")
      .setDescription("Resolve a handle to its DID")
      .addStringOption((option) =>
        option
          .setName("handle")
          .setDescription("Handle of the user (without the @)")
          .setRequired(true),
      ),
  },
  {
    data: new SlashCommandBuilder()
      .setName("handle")
      .setDescription("Resolve a DID to its handle")
      .addStringOption((option) =>
        option
          .setName("did")
          .setDescription("DID of the user (did:plc or did:web)")
          .setRequired(true),
      ),
  },
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);

try {
  console.log("Started refreshing application (/) commands.");

  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID!), {
    body: commands.map((cmd) => cmd.data.toJSON()),
  });

  console.log("Successfully reloaded application (/) commands.");
} catch (error) {
  console.error(error);
}

const rpc = new XRPC({
  handler: new CredentialManager({ service: "https://public.api.bsky.app" }),
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "profile") {
    const actor = interaction.options.getString("actor", true);
    try {
      const res = await rpc.get("app.bsky.actor.getProfile", {
        params: { actor: actor },
      });
      const profileEmbed = new EmbedBuilder()
        .setColor(0x2fb6f5)
        .setTitle(res.data.displayName ?? `@${res.data.handle}`)
        .setAuthor({
          name: `@${res.data.handle}`,
          url: `https://bsky.app/profile/${res.data.did}`,
        })
        .setURL(`https://bsky.app/profile/${res.data.did}`)
        .setThumbnail(res.data.avatar ?? null)
        .setImage(res.data.banner ?? null);
      if (res.data.followersCount)
        profileEmbed.addFields({
          name: "Followers",
          value: res.data.followersCount.toString(),
          inline: true,
        });
      if (res.data.followsCount)
        profileEmbed.addFields({
          name: "Following",
          value: res.data.followsCount.toString(),
          inline: true,
        });
      if (res.data.postsCount)
        profileEmbed.addFields({
          name: "Posts",
          value: res.data.postsCount.toString(),
          inline: true,
        });
      if (res.data.description)
        profileEmbed.addFields({
          name: "Description",
          value: res.data.description,
        });
      await interaction.reply({ embeds: [profileEmbed] });
    } catch {
      await interaction.reply(`Could not find user \`${actor}\``);
    }
  }
  if (interaction.commandName === "did") {
    const handle = interaction.options.getString("handle", true);
    try {
      const res = await rpc.get("com.atproto.identity.resolveHandle", {
        params: { handle: handle },
      });
      await interaction.reply(`\`${handle}\` -> \`${res.data.did}\``);
    } catch {
      await interaction.reply(`Could not resolve \`${handle}\``);
    }
  }
  if (interaction.commandName === "handle") {
    const did = interaction.options.getString("did", true);
    try {
      const res = await fetch(
        did.startsWith("did:web")
          ? `https://${did.split(":")[2]}/.well-known/did.json`
          : "https://plc.directory/" + did,
      );

      const handle = await res.json().then((doc) => {
        for (const alias of doc.alsoKnownAs) {
          if (alias.includes("at://")) {
            return alias.split("//")[1];
          }
        }
      });

      await interaction.reply(`\`${did}\` -> \`${handle}\``);
    } catch {
      await interaction.reply(`Could not resolve \`${did}\``);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
