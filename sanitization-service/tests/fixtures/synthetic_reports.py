"""
Synthetic pentest report data for testing sanitization pipeline.

All data is completely synthetic - no real company names or PII.
"""

# English pentest report excerpt with known entities
REPORT_SNIPPET_EN = """
Penetration Test Report - GlobalTech Corp Internal Assessment

Executive Summary:
During the engagement, the team identified multiple security vulnerabilities affecting
GlobalTech-corp.com infrastructure. The primary target server at 10.1.2.50 was found
to be running OpenSSH 8.2p1 with outdated configurations. Additionally, the web server
at 192.168.1.1 hosting Apache/2.4.51 contained several critical vulnerabilities.

Technical Findings:
1. Active Directory Enumeration:
   - Domain Controller: dc01.globaltech.internal (172.16.0.100)
   - User account discovered: CN=Carlos Silva,OU=IT,DC=globaltech,DC=internal
   - Service account found: CN=Maria Santos,OU=Service Accounts,DC=globaltech,DC=internal

2. File Share Access:
   - Network path accessible: \\\\fileserver.corp.local\\shares\\confidential
   - Sensitive documents located at: smb://fileserver/hr/personnel

3. Email Infrastructure:
   - Email accounts identified: carlos.silva@globaltech-corp.com, maria.santos@globaltech-corp.com
   - Mail server at 10.1.2.60 running Postfix

4. Version Information (for reference):
   - Target systems running nginx/1.20.2 and MySQL 5.7.36
   - Scan performed with Nmap 7.92

Note: Localhost (127.0.0.1) and documentation IPs (192.0.2.1) were excluded from testing.
"""

# Known entities in English snippet with their types and approximate positions
KNOWN_ENTITIES_EN = {
    "carlos.silva@globaltech-corp.com": {"type": "EMAIL_ADDRESS", "count": 1},
    "maria.santos@globaltech-corp.com": {"type": "EMAIL_ADDRESS", "count": 1},
    "10.1.2.50": {"type": "IP_ADDR", "count": 1},
    "192.168.1.1": {"type": "IP_ADDR", "count": 1},
    "172.16.0.100": {"type": "IP_ADDR", "count": 1},
    "10.1.2.60": {"type": "IP_ADDR", "count": 1},
    "dc01.globaltech.internal": {"type": "HOSTNAME", "count": 1},
    "fileserver.corp.local": {"type": "HOSTNAME", "count": 1},
    "CN=Carlos Silva,OU=IT,DC=globaltech,DC=internal": {"type": "AD_OBJECT", "count": 1},
    "CN=Maria Santos,OU=Service Accounts,DC=globaltech,DC=internal": {"type": "AD_OBJECT", "count": 1},
    "\\\\fileserver.corp.local\\shares\\confidential": {"type": "NETWORK_PATH", "count": 1},
    "smb://fileserver/hr/personnel": {"type": "NETWORK_PATH", "count": 1},
    "GlobalTech-corp.com": {"type": "DOMAIN", "count": 1},
    "globaltech-corp.com": {"type": "DOMAIN", "count": 2},
    "Carlos Silva": {"type": "PERSON", "count": 1},
    "Maria Santos": {"type": "PERSON", "count": 1},
}

# Version strings that should NOT be detected as IPs
VERSION_STRINGS_EN = [
    "OpenSSH 8.2p1",
    "Apache/2.4.51",
    "nginx/1.20.2",
    "MySQL 5.7.36",
    "Nmap 7.92",
]

# IPs that should be rejected (localhost, RFC5737 documentation)
REJECTED_IPS_EN = [
    "127.0.0.1",
    "192.0.2.1",
]

# Portuguese pentest report excerpt
REPORT_SNIPPET_PT = """
Relatório de Teste de Penetração - Empresa Exemplo Ltda

Sumário Executivo:
Durante o teste de segurança, a equipe identificou vulnerabilidades críticas na
infraestrutura da empresa. O servidor principal em 10.10.20.5 apresentou falhas
de configuração significativas.

Descobertas Técnicas:
1. Enumeração de Usuários:
   - Conta de usuário: Joao Ferreira (joao.ferreira@empresa-exemplo.com.br)
   - Administrador: Ana Oliveira (ana.oliveira@empresa-exemplo.com.br)

2. Servidores Identificados:
   - Servidor web: srv-web01.empresa.local (10.10.20.10)
   - Servidor de arquivos: \\\\fileserver\\compartilhado\\documentos

3. Domínio:
   - Domínio principal: empresa-exemplo.com.br
   - AD Object: CN=Joao Ferreira,OU=TI,DC=empresa,DC=local
"""

# Known entities in Portuguese snippet
KNOWN_ENTITIES_PT = {
    "10.10.20.5": {"type": "IP_ADDR", "count": 1},
    "10.10.20.10": {"type": "IP_ADDR", "count": 1},
    "joao.ferreira@empresa-exemplo.com.br": {"type": "EMAIL_ADDRESS", "count": 1},
    "ana.oliveira@empresa-exemplo.com.br": {"type": "EMAIL_ADDRESS", "count": 1},
    "srv-web01.empresa.local": {"type": "HOSTNAME", "count": 1},
    "\\\\fileserver\\compartilhado\\documentos": {"type": "NETWORK_PATH", "count": 1},
    "empresa-exemplo.com.br": {"type": "DOMAIN", "count": 2},
    "CN=Joao Ferreira,OU=TI,DC=empresa,DC=local": {"type": "AD_OBJECT", "count": 1},
    "Joao Ferreira": {"type": "PERSON", "count": 2},
    "Ana Oliveira": {"type": "PERSON", "count": 1},
}

# Simple test cases for edge case validation
EDGE_CASE_IP_WITH_CIDR = "Network subnet: 10.1.2.0/24"
EDGE_CASE_MULTIPLE_IPS = "Servers at 10.1.1.1, 10.1.1.2, and 10.1.1.3 were scanned."
EDGE_CASE_MIXED_CONTENT = "Contact support@example.com or visit dc01.internal for help with 192.168.1.100"
