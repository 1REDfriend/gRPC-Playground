# Prints every grpcurl command from the site's snippets as one line, pointed at the test port.
import re, sys
out = []
for f in ("snippets/what-is-grpc/shell.sh", "snippets/health-reflection/shell.sh"):
    src = open(f, encoding="utf-8").read().replace(chr(92) + chr(10), " ")
    for line in src.splitlines():
        if line.startswith("grpcurl"):
            out.append(re.sub(r"\s+", " ", line).replace("50051", "47214"))
sys.stdout.write("\n".join(out) + "\n")
