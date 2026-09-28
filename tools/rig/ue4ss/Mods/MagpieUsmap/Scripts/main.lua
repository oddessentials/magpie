local OUT = os.getenv("MAGPIE_PROBE_FILE") or "magpie-probe.txt"

local function write(line)
    local file = io.open(OUT, "a")
    if file then
        file:write(line, "\n")
        file:close()
    end
    print("[MagpieUsmap] " .. line .. "\n")
end

ExecuteWithDelay(70000, function()
    local candidates = { "DumpUSMAP", "DumpUsmap", "GenerateUSMAP" }
    for _, name in ipairs(candidates) do
        local fn = _G[name]
        if type(fn) == "function" then
            local ok, err = pcall(fn)
            write(name .. (ok and " ran" or (" failed: " .. tostring(err))))
            return
        end
    end
    write("no usmap dumper global found among " .. table.concat(candidates, ", "))
end)
