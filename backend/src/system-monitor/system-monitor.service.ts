import { Injectable, Logger } from '@nestjs/common';
import * as si from 'systeminformation';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

interface SystemdServiceStatus {
  name: string;
  serviceName: string;
  status: 'active' | 'inactive' | 'failed' | 'not_found';
  healthy: boolean;
}

@Injectable()
export class SystemMonitorService {
  private readonly logger = new Logger(SystemMonitorService.name);
  private cache: { data: unknown; timestamp: number } | null = null;
  private readonly CACHE_TTL = 5000;

  async getInfrastructureStats() {
    if (this.cache && Date.now() - this.cache.timestamp < this.CACHE_TTL) {
      return this.cache.data;
    }

    try {
      const isSystemd =
        process.env.DEPLOYMENT_MODE === 'systemd' || process.env.NODE_ENV === 'production';

      const [cpuLoad, mem, fsData, cpuInfo, cpuTemp, netStats] = await Promise.all([
        si.currentLoad().catch(() => null),
        si.mem().catch(() => null),
        si.fsSize().catch(() => [] as si.Systeminformation.FsSizeData[]),
        si.cpu().catch(() => null),
        si.cpuTemperature().catch(() => null),
        si.networkStats().catch(() => [] as si.Systeminformation.NetworkStatsData[]),
      ]);

      const mainDisk =
        Array.isArray(fsData) && fsData.length > 0
          ? fsData.reduce((a, b) => (a.size > b.size ? a : b))
          : null;

      const mainNet = Array.isArray(netStats) && netStats.length > 0 ? netStats[0] : null;
      const loadAvg = os.loadavg();
      const uptimeSeconds = os.uptime();

      const deployment = {
        mode: isSystemd ? ('systemd' as const) : ('docker' as const),
        environment:
          process.env.NODE_ENV === 'production'
            ? ('production' as const)
            : ('development' as const),
      };

      const dockerStats = isSystemd ? null : await this.getDockerStats();
      const services = isSystemd ? await this.getSystemdServicesStatus() : null;

      const result = {
        cpu: {
          usage: Math.round(cpuLoad?.currentLoad ?? 0),
          cores: cpuInfo?.cores ?? os.cpus().length,
          temperature: cpuTemp?.main != null ? Math.round(cpuTemp.main) : null,
          model: cpuInfo?.brand ?? 'Unknown',
        },
        ram: {
          total: Math.round((mem?.total ?? 0) / 1024 / 1024),
          used: Math.round(
            ((mem?.total ?? 0) - (mem?.available ?? mem?.free ?? 0)) / 1024 / 1024,
          ),
          free: Math.round((mem?.available ?? mem?.free ?? 0) / 1024 / 1024),
          usagePercent: mem
            ? Math.round(((mem.total - (mem.available ?? mem.free)) / mem.total) * 100)
            : 0,
        },
        disk: {
          total: Math.round((mainDisk?.size ?? 0) / 1024 / 1024 / 1024),
          used: Math.round((mainDisk?.used ?? 0) / 1024 / 1024 / 1024),
          free: Math.round(
            ((mainDisk?.size ?? 0) - (mainDisk?.used ?? 0)) / 1024 / 1024 / 1024,
          ),
          usagePercent: mainDisk ? Math.round(mainDisk.use ?? 0) : 0,
        },
        system: {
          uptime: this.formatUptime(uptimeSeconds),
          platform: os.platform(),
          hostname: os.hostname(),
          loadAverage: loadAvg.map((v) => Math.round(v * 100) / 100),
        },
        network: {
          rx: this.formatBytes(mainNet?.rx_bytes ?? 0),
          tx: this.formatBytes(mainNet?.tx_bytes ?? 0),
        },
        deployment,
        ...(dockerStats !== null && { docker: dockerStats }),
        ...(services !== null && { services }),
      };

      this.cache = { data: result, timestamp: Date.now() };
      return result;
    } catch (error) {
      this.logger.error('Failed to get infrastructure stats', error);
      return this.getFallbackStats();
    }
  }

  private async getDockerStats(): Promise<{
    containersRunning: number;
    containersStopped: number;
    unavailable?: boolean;
  }> {
    try {
      const { stdout } = await Promise.race<{ stdout: string; stderr: string }>([
        execAsync('docker ps -a --format "{{.Status}}"'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Docker timeout')), 2000),
        ),
      ]);
      const lines = stdout.trim().split('\n').filter(Boolean);
      const running = lines.filter((s) => s.toLowerCase().startsWith('up')).length;
      return { containersRunning: running, containersStopped: lines.length - running };
    } catch {
      return { containersRunning: 0, containersStopped: 0, unavailable: true };
    }
  }

  private async getSystemdServicesStatus(): Promise<SystemdServiceStatus[]> {
    const serviceDefinitions = [
      { name: 'PostgreSQL', serviceName: process.env.POSTGRES_SERVICE_NAME ?? 'postgresql' },
      { name: 'Redis', serviceName: process.env.REDIS_SERVICE_NAME ?? 'redis-server' },
      { name: 'Nginx', serviceName: process.env.NGINX_SERVICE_NAME ?? 'nginx' },
      { name: 'MinIO', serviceName: process.env.MINIO_SERVICE_NAME ?? 'minio' },
      { name: 'Backend', serviceName: process.env.BACKEND_SERVICE_NAME ?? 'stockini-backend' },
      { name: 'Frontend', serviceName: process.env.FRONTEND_SERVICE_NAME ?? 'stockini-frontend' },
      { name: 'Fail2ban', serviceName: 'fail2ban' },
    ];

    return Promise.all(
      serviceDefinitions.map(async ({ name, serviceName }) => {
        try {
          const { stdout } = await Promise.race<{ stdout: string; stderr: string }>([
            execAsync(`systemctl is-active ${serviceName}`),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), 2000),
            ),
          ]);
          const status = stdout.trim() as SystemdServiceStatus['status'];
          return { name, serviceName, status, healthy: status === 'active' };
        } catch (err: unknown) {
          const error = err as { stdout?: string };
          const rawStatus = error.stdout?.trim();
          if (
            rawStatus &&
            ['inactive', 'failed', 'activating', 'deactivating'].includes(rawStatus)
          ) {
            return {
              name,
              serviceName,
              status: rawStatus as 'inactive' | 'failed',
              healthy: false,
            };
          }
          return { name, serviceName, status: 'not_found' as const, healthy: false };
        }
      }),
    );
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}j ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  private formatBytes(bytes: number): string {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  private getFallbackStats() {
    const isSystemd =
      process.env.DEPLOYMENT_MODE === 'systemd' || process.env.NODE_ENV === 'production';
    return {
      cpu: { usage: 0, cores: 0, temperature: null, model: '--' },
      ram: { total: 0, used: 0, free: 0, usagePercent: 0 },
      disk: { total: 0, used: 0, free: 0, usagePercent: 0 },
      system: { uptime: '--', platform: 'linux', hostname: '--', loadAverage: [0, 0, 0] },
      network: { rx: '--', tx: '--' },
      deployment: {
        mode: isSystemd ? ('systemd' as const) : ('docker' as const),
        environment:
          process.env.NODE_ENV === 'production'
            ? ('production' as const)
            : ('development' as const),
      },
      ...(isSystemd
        ? { services: [] as SystemdServiceStatus[] }
        : { docker: { containersRunning: 0, containersStopped: 0 } }),
    };
  }
}
