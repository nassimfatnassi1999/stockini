# 🛡️ Security Policy Manager — Guide d'utilisation

## Présentation

**`security-politic.sh`** est un script interactif tout-en-un qui regroupe toutes les configurations de sécurité pour votre VPS CRM Geodetection :

- 🔥 **Firewall (UFW)** — Ports 22/80/443 + mode Cloudflare
- 🔑 **SSH Hardening** — Désactivation root, auth par clé uniquement
- 🛡️ **Fail2ban** — Protection contre brute-force (SSH, Nginx, CRM)
- 📊 **Logging & Monitoring** — Rotation des logs + alertes sécurité

## 🚀 Lancement rapide

```bash
# Sur votre VPS, en tant que root :
sudo bash deploy/scripts/security-politic.sh
```

## 📋 Menu interactif

Le script affiche un menu élégant avec 7 options :

```
╔═══════════════════════════════════════════════════════════════╗
║        🛡️  CRM Geodetection — Security Policy Manager  🛡️        ║
║             Complete VPS Hardening & Protection              ║
╚═══════════════════════════════════════════════════════════════╝

🔐 Security Policy Manager

Choose a security configuration:

1) 🔥 Setup Firewall (UFW)
2) 🔑 Harden SSH Access
3) 🛡️  Configure Fail2ban
4) 📊 Setup Logging & Monitoring
5) ⚡ COMPLETE HARDENING (All-in-One)
6) 📋 Security Status Report
7) ❌ Exit
```

## 🎯 Options détaillées

### Option 1 : 🔥 Setup Firewall (UFW)

- Installe UFW si nécessaire
- Reset de toutes les règles
- Ouvre uniquement les ports **22 (SSH)**, **80 (HTTP)**, **443 (HTTPS)**
- **Bonus** : Mode Cloudflare (restreint 80/443 aux IPs Cloudflare uniquement)

**Questions posées :**
- "Do you want to restrict ports 80/443 to Cloudflare IPs only?" (y/N)

### Option 2 : 🔑 Harden SSH Access

- Désactive login root
- Désactive authentification par mot de passe (clé SSH uniquement)
- Limite à 3 tentatives d'authentification
- Timeout après 5 minutes d'inactivité
- **Bonus** : Restriction par IP (n'autorise qu'une seule IP à se connecter)

**Questions posées :**
- "Enter the non-root username with SSH key configured" (si lancé en root)
- "Do you want to restrict SSH to a specific IP address?" (y/N)
- "Enter your fixed IP address" (si oui à la question précédente)

**⚠️ IMPORTANT :** Avant d'exécuter :
```bash
# Assurez-vous d'avoir votre clé SSH configurée :
ssh-copy-id votre_user@VPS_IP

# Testez dans un NOUVEAU terminal AVANT de fermer la session actuelle !
```

### Option 3 : 🛡️ Configure Fail2ban

Installe et configure 6 jails Fail2ban :

| Jail | Protection contre | Ban après | Durée |
|------|-------------------|-----------|-------|
| `sshd` | SSH brute force | 5 échecs | 1h |
| `sshd-aggressive` | SSH répété | 3 échecs | 24h |
| `nginx-botsearch` | Scanners nginx | 10 hits | 10min |
| `nginx-badbots` | User-agents malveillants | 2 hits | 24h |
| `nginx-http-auth` | HTTP auth failures | 5 échecs | 1h |
| `crm-login` | Brute force CRM | 5 échecs | 30min |

**Aucune question posée** — configuration automatique.

### Option 4 : 📊 Setup Logging & Monitoring

- Rotation des logs nginx (30 jours)
- Script de monitoring sécurité (toutes les 15 minutes via cron)
- Détection automatique : SSH brute force, scans nginx, tentatives login CRM
- **Bonus** : Alertes email (via msmtp + SMTP)

**Questions posées :**
- "Do you want to configure email alerts?" (y/N)
- Si oui : SMTP host, port, user, password, from email, alert email

**Fichiers créés :**
- `/usr/local/bin/crm-security-monitor.sh` — Script de monitoring
- `/var/log/crm-geodetection/security-alerts.log` — Log des alertes

**Vérifier les alertes :**
```bash
tail -f /var/log/crm-geodetection/security-alerts.log
```

### Option 5 : ⚡ COMPLETE HARDENING (All-in-One)

**Execute toutes les options 1-4 en séquence automatique.**

Ordre d'exécution :
1. Firewall (UFW)
2. SSH Hardening
3. Fail2ban
4. Logging & Monitoring

**Durée estimée :** 5-10 minutes

**Idéal pour :** Premier déploiement, nouvelle installation VPS.

### Option 6 : 📋 Security Status Report

Affiche le statut actuel de toutes les configurations de sécurité :

```
🔒 Security Status

✅ Firewall (UFW): ACTIVE
   • 22/tcp     ALLOW       Anywhere (SSH)
   • 80/tcp     ALLOW       Anywhere (HTTP)
   • 443/tcp    ALLOW       Anywhere (HTTPS)

✅ SSH Hardening: CONFIGURED
   • Root login disabled
   • Password auth disabled (key-only)
   • Max 3 auth attempts

✅ Fail2ban: ACTIVE
   Jails: sshd sshd-aggressive nginx-botsearch nginx-badbots crm-login

✅ Security Monitoring: ACTIVE
   • Log rotation configured
   • Cron monitoring (every 15min)
```

**Aucune action effectuée** — consultation uniquement.

### Option 7 : ❌ Exit

Quitte le script proprement.

## 🔍 Commandes utiles post-configuration

### UFW (Firewall)
```bash
# Voir le statut
sudo ufw status verbose

# Voir les règles numérotées
sudo ufw status numbered

# Supprimer une règle
sudo ufw delete [numéro]

# Désactiver temporairement
sudo ufw disable
```

### Fail2ban
```bash
# Statut général
sudo fail2ban-client status

# Statut d'un jail spécifique
sudo fail2ban-client status sshd
sudo fail2ban-client status crm-login

# Débannir une IP
sudo fail2ban-client set sshd unbanip 1.2.3.4

# Voir les IPs bannies
sudo fail2ban-client status sshd | grep "Banned IP list"
```

### SSH
```bash
# Tester la config SSH
sudo sshd -t

# Voir les tentatives de connexion échouées
sudo grep "Failed password" /var/log/auth.log | tail -20

# Voir les connexions réussies
sudo grep "Accepted publickey" /var/log/auth.log | tail -20
```

### Monitoring
```bash
# Voir les alertes en temps réel
tail -f /var/log/crm-geodetection/security-alerts.log

# Voir les logs nginx
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# Exécuter manuellement le script de monitoring
sudo /usr/local/bin/crm-security-monitor.sh
```

## 🐛 Troubleshooting

### "Neither dialog nor whiptail found"
Le script installe automatiquement `dialog` si manquant. Si erreur :
```bash
sudo apt-get update && sudo apt-get install -y dialog
```

### "No SSH key found"
Ajoutez votre clé publique avant de lancer le hardening SSH :
```bash
ssh-copy-id votre_user@VPS_IP
```

### Vous êtes lock-out après SSH hardening
1. Si vous avez un accès console web (OVH, DigitalOcean, etc.) :
```bash
# Restaurer la backup SSH
sudo mv /etc/ssh/sshd_config.bak.* /etc/ssh/sshd_config
sudo rm /etc/ssh/sshd_config.d/99-crm-hardening.conf
sudo systemctl restart sshd
```

2. Si restriction IP active, modifiez UFW depuis la console :
```bash
sudo ufw delete allow from VOTRE_IP to any port 22
sudo ufw allow 22/tcp
sudo ufw reload
```

### Fail2ban bloque une IP légitime
```bash
# Identifier le jail
sudo fail2ban-client status | grep "Jail list"

# Débannir l'IP de tous les jails
for jail in $(sudo fail2ban-client status | grep "Jail list" | sed 's/.*://;s/,/ /g'); do
  sudo fail2ban-client set $jail unbanip VOTRE_IP
done
```

## 📝 Logs importants

| Fichier | Contenu |
|---------|---------|
| `/var/log/auth.log` | Tentatives SSH, sudo |
| `/var/log/nginx/access.log` | Requêtes HTTP/HTTPS |
| `/var/log/nginx/error.log` | Erreurs nginx |
| `/var/log/crm-geodetection/security-alerts.log` | Alertes sécurité CRM |
| `/var/log/fail2ban.log` | Actions Fail2ban |
| `/var/log/ufw.log` | Connexions bloquées par firewall |

## 🎓 Bonnes pratiques

1. **Toujours tester SSH dans un nouveau terminal** avant de fermer votre session actuelle
2. **Activez Cloudflare** pour masquer l'IP réelle de votre serveur
3. **Configurez les alertes email** pour être notifié des incidents
4. **Vérifiez régulièrement** le security status (option 6)
5. **Gardez une backup** de votre config SSH (`/etc/ssh/sshd_config.bak.*`)
6. **Documentez votre IP fixe** si vous activez la restriction SSH par IP

## 🔐 Ordre recommandé (premier déploiement)

```bash
# Sur VPS fraîchement installé :
sudo bash deploy/scripts/1_setup_vps.sh      # Docker + outils
bash deploy/scripts/2_deploy.sh              # Déployer l'app
bash deploy/scripts/3_migrate.sh             # Migrations DB

# PUIS lancer le security manager :
sudo bash deploy/scripts/security-politic.sh
# → Choisir option 5 (COMPLETE HARDENING)
```

## 💡 Astuces

- **Mode Cloudflare :** Activez-le uniquement si votre domaine est proxied (icône orange) sur Cloudflare
- **SSH par IP :** Utilisez-le uniquement si vous avez une IP fixe (4G/5G = IP changeante !)
- **Email alerts :** Brevo offre 300 emails/jour gratuits (suffisant pour les alertes)
- **Test Fail2ban :** `sudo fail2ban-client ping` doit retourner "pong"

## 🆘 Support

En cas de problème :
1. Consultez les logs pertinents (voir section "Logs importants")
2. Vérifiez le statut avec l'option 6 du menu
3. Restaurez les backups si nécessaire
4. Utilisez la console web de votre hébergeur en dernier recours
