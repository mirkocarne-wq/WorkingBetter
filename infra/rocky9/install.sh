#!/usr/bin/env bash
# Preparazione di un server Rocky Linux 9 (o RHEL/Alma 9) per WorkingBetter: Docker, git, firewall, cartelle, chiave per GitHub.
# Da eseguire come root (o con sudo) una sola volta; è idempotente. Guida: docs/15-server-di-prova-rocky9.md
#   dal PC:  scp infra/rocky9/install.sh root@<server>:/root/   poi sul server:  bash /root/install.sh
# Variabili opzionali: WB_DIR (default /opt/workingbetter), WB_REPO (default git@github.com:mirkocarne-wq/WorkingBetter.git),
#                      WB_BRANCH (default main), WB_USER (utente non root da aggiungere al gruppo docker; default: chi ha lanciato sudo)
set -euo pipefail
WB_DIR="${WB_DIR:-/opt/workingbetter}"
WB_REPO="${WB_REPO:-git@github.com:mirkocarne-wq/WorkingBetter.git}"
WB_BRANCH="${WB_BRANCH:-main}"
WB_USER="${WB_USER:-${SUDO_USER:-}}"
KEY=/root/.ssh/wb_deploy_ed25519

[[ $EUID -eq 0 ]] || { echo "eseguire come root: sudo bash $0"; exit 1; }
grep -qiE 'rocky|rhel|almalinux|centos' /etc/os-release || echo "avviso: distribuzione non riconosciuta come famiglia RHEL 9, si prosegue comunque"

step() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }

step "Aggiornamento pacchetti e utilità di base"
dnf -y -q update
dnf -y -q install dnf-plugins-core git curl tar policycoreutils-python-utils chrony
systemctl enable --now chronyd >/dev/null 2>&1 || true

step "Docker Engine + Compose (repository ufficiale Docker, compatibile con Rocky 9)"
# podman/buildah portano un pacchetto `docker` fittizio in conflitto con docker-ce
dnf -y -q remove podman-docker docker docker-client docker-common docker-engine 2>/dev/null || true
if ! rpm -q docker-ce >/dev/null 2>&1; then
  dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
  dnf -y -q install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
docker compose version
if [[ -n "$WB_USER" && "$WB_USER" != "root" ]]; then usermod -aG docker "$WB_USER" && echo "utente $WB_USER aggiunto al gruppo docker (rientrare nella sessione per applicarlo)"; fi

step "Firewall: 80/443 (app e API) e 8443 (console) aperti; il resto resta chiuso"
if systemctl is-active --quiet firewalld; then
  firewall-cmd -q --permanent --add-service=http
  firewall-cmd -q --permanent --add-service=https
  firewall-cmd -q --permanent --add-port=8443/tcp
  firewall-cmd -q --reload
  echo "firewalld: http, https, 8443/tcp abilitati (per limitare la console a una rete: docs/15 §7)"
else
  echo "firewalld non attivo: nessuna regola aggiunta"
fi

step "Cartelle: $WB_DIR (codice) e $WB_DIR/backups (dump del database)"
mkdir -p "$WB_DIR" /var/backups/workingbetter
chmod 750 /var/backups/workingbetter

step "Chiave SSH di deploy per GitHub (sola lettura)"
mkdir -p /root/.ssh && chmod 700 /root/.ssh
if [[ ! -f "$KEY" ]]; then
  ssh-keygen -q -t ed25519 -N "" -C "workingbetter-deploy@$(hostname -s)" -f "$KEY"
fi
if ! grep -q "IdentityFile $KEY" /root/.ssh/config 2>/dev/null; then
  cat >> /root/.ssh/config <<CFG
Host github.com
  HostName github.com
  User git
  IdentityFile $KEY
  IdentitiesOnly yes
CFG
  chmod 600 /root/.ssh/config
fi
touch /root/.ssh/known_hosts && chmod 600 /root/.ssh/known_hosts
grep -q "^github.com ssh-ed25519" /root/.ssh/known_hosts || ssh-keyscan -t ed25519 github.com 2>/dev/null >> /root/.ssh/known_hosts

step "Clone del repository"
if [[ -d "$WB_DIR/.git" ]]; then
  echo "repository già presente in $WB_DIR"
elif ssh -o BatchMode=yes -o ConnectTimeout=10 -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
  git clone --branch "$WB_BRANCH" "$WB_REPO" "$WB_DIR"
else
  cat <<MSG

La chiave non è ancora autorizzata su GitHub. Aggiungila come **Deploy key** (sola lettura) al repository:
  GitHub → repository → Settings → Deploy keys → Add deploy key → incolla questa chiave pubblica:

$(cat "$KEY.pub")

Poi rilancia questo script (salta ciò che è già fatto) oppure esegui:
  git clone --branch $WB_BRANCH $WB_REPO $WB_DIR
MSG
  exit 0
fi

step "Timer di backup giornaliero (systemd)"
install -m 644 "$WB_DIR/infra/rocky9/systemd/wb-backup.service" /etc/systemd/system/
install -m 644 "$WB_DIR/infra/rocky9/systemd/wb-backup.timer" /etc/systemd/system/
sed -i "s#/opt/workingbetter#$WB_DIR#g" /etc/systemd/system/wb-backup.service
systemctl daemon-reload
systemctl enable --now wb-backup.timer

cat <<MSG

Server pronto. Prossimi passi (docs/15 §4-5):
  cd $WB_DIR
  sudo infra/rocky9/init-env.sh app.esempio.it api.esempio.it console.esempio.it   # crea .env con i segreti
  sudo infra/rocky9/deploy.sh                                                       # build, migrazioni, avvio
MSG
