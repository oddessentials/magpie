local OUT = os.getenv("MAGPIE_PROBE_FILE") or "magpie-probe.txt"
local DELAY = tonumber(os.getenv("MAGPIE_PROBE_DELAY_MS")) or 45000

local function write(lines)
    local file = io.open(OUT, "a")
    if file then
        file:write(table.concat(lines, "\n"), "\n")
        file:close()
    end
end

local function scan()
    local objects, listed = 0, 0
    local seen, batch = {}, {}
    ForEachUObject(function(object)
        objects = objects + 1
        local ok, name = pcall(function()
            return object:GetFullName()
        end)
        if ok and type(name) == "string" and name:sub(1, 9) == "Function " and not seen[name] then
            seen[name] = true
            listed = listed + 1
            batch[#batch + 1] = name
            if #batch >= 2000 then
                write(batch)
                batch = {}
            end
        end
    end)
    write(batch)
    local summary = string.format("scanned %d objects, %d functions", objects, listed)
    write({ summary })
    print("[MagpieProbe] " .. summary .. "\n")
end

write({ "loaded " .. os.date("!%Y-%m-%dT%H:%M:%SZ") })
ExecuteWithDelay(DELAY, function()
    local ok, err = pcall(scan)
    if not ok then
        write({ "scan failed: " .. tostring(err) })
    end
end)
