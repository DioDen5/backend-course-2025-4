const http = require("http");
const fs = require("fs");
const { Command } = require("commander");
const { XMLBuilder } = require("fast-xml-parser");

const program = new Command();

program
    .option("-i, --input <path>", "path to input file")
    .option("--host <host>", "server host")
    .option("-p, --port <port>", "server port");

function exitWithMessage(message) {
    console.log(message);
    process.exit(1);
}

program.parse(process.argv);
const opts = program.opts();

if (!opts.input) exitWithMessage("Please, specify input file");
if (!opts.host) exitWithMessage("Please, specify host");
if (!opts.port) exitWithMessage("Please, specify port");

const PORT = Number(opts.port);

if (!Number.isFinite(PORT) || PORT <= 0) {
    exitWithMessage("Invalid port value");
}

function readPassengersAsync(filePath) {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, "utf-8", (err, raw) => {
            if (err) {
                if (err.code === "ENOENT") {
                    return reject(new Error("Cannot find input file"));
                }
                return reject(err);
            }

            try {
                const text = raw.trim();

                if (!text) {
                    return resolve([]);
                }

                if (text.startsWith("[")) {
                    return resolve(JSON.parse(text));
                }

                const rows = text
                    .split("\n")
                    .filter(line => line.trim() !== "")
                    .map(line => JSON.parse(line));

                resolve(rows);
            } catch {
                reject(new Error("Invalid JSON format"));
            }
        });
    });
}

function isSurvivedValue(value) {
    if (value === true) return true;
    if (value === false) return false;

    const s = String(value).trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes";
}

function buildXML(passengers, showAge) {
    const builder = new XMLBuilder({
        ignoreAttributes: false,
        format: true
    });

    const data = {
        passengers: {
            passenger: passengers.map(p => {
                const obj = {
                    name: p?.Name || "",
                    ticket: p?.Ticket || ""
                };

                if (showAge) {
                    obj.age = p?.Age || "";
                }

                return obj;
            })
        }
    };

    return builder.build(data);
}

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://${opts.host}:${PORT}`);

        const onlySurvived = url.searchParams.get("survived") === "true";
        const showAge = url.searchParams.get("age") === "true";

        const passengers = await readPassengersAsync(opts.input);

        let filtered = passengers;

        if (onlySurvived) {
            filtered = passengers.filter(p => isSurvivedValue(p?.Survived));
        }

        const xml = buildXML(filtered, showAge);

        res.writeHead(200, {
            "Content-Type": "application/xml"
        });

        res.end(xml);

    } catch (err) {

        const message = err.message || "Server error";

        const status = message === "Cannot find input file" ? 404 : 500;

        res.writeHead(status, {
            "Content-Type": "text/plain"
        });

        res.end(message);
    }
});

server.listen(PORT, opts.host, () => {
    console.log(`Server started at http://${opts.host}:${PORT}`);
});