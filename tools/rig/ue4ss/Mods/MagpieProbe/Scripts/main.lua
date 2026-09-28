local OUT = os.getenv("MAGPIE_PROBE_FILE") or "magpie-probe.txt"
local WORDS = { "Chat", "Login", "Logout", "Kick", "Ban", "Dead", "Death", "Respawn", "Journal", "Quest", "Skill", "Xp", "Unlock", "Craft", "Build", "Gravestone", "Teleport", "Weather", "Admin", "Owner" }

local function write(line)
    local file = io.open(OUT, "a")
    if file then
        file:write(line, "\n")
        file:close()
    end
    print("[MagpieProbe] " .. line .. "\n")
end

local function interesting(name)
    for _, word in ipairs(WORDS) do
        if name:find(word, 1, true) then
            return true
        end
    end
    return false
end

local function scan()
    local objects, functions, listed = 0, 0, 0
    local seen = {}
    ForEachUObject(function(object)
        objects = objects + 1
        local ok, name = pcall(function()
            return object:GetFullName()
        end)
        if ok and type(name) == "string" and name:sub(1, 9) == "Function " then
            functions = functions + 1
            if interesting(name) and not seen[name] then
                seen[name] = true
                listed = listed + 1
                write(name)
            end
        end
    end)
    write(string.format("scanned %d objects, %d functions, %d listed", objects, functions, listed))
end

write("loaded " .. os.date("!%Y-%m-%dT%H:%M:%SZ"))
ExecuteWithDelay(45000, function()
    local ok, err = pcall(scan)
    if not ok then
        write("scan failed: " .. tostring(err))
    end
end)
