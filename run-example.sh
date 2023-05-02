#/usr/bin/env bash
set -euo pipefail
cd "${0%/*}"

declare LOG_ROOT
declare LICENSE_FILE

function usage() {
    # TODO :)
    echo "Usage: run-example --license-file <license-file> [options] [cmd]"
    echo Options:
    echo "--log-root <log-dir>: where you want Norsk's logs mounted.  The actual logs will be in a subdirectory with the name of the example you are running.  Default ./norskLogs"
    echo Options:
    echo "--network-mode [docker|host]: whether the example should run in host or docker network mode.  Defaults to host"
    echo TBD
    echo Commands:
    echo "list : List the example names along with a short description of each"
    echo "run <example-name> : run the named example"
    exit 1
}

function checkDockerCompose() {
    local -r composeVersion=$(docker-compose version 2>/dev/null || echo "notFound")
    if [[ $composeVersion == "notFound" ]]; then
        echo "Unable to find docker compose - exiting"
        exit 1
    fi
    echo "Found docker compose version ${composeVersion}"
}

function listExamples() {
    echo "here is the list of examples"
    exit 0
}

function runExample() {
    local -r exampleName=${1}
    local -r dcPath=${2}
    mkdir -p "$LOG_ROOT/$exampleName"
    
    LICENSE_FILE="$(realpath "$LICENSE_FILE")" \
    LOG_ROOT=$(realpath "$LOG_ROOT/$exampleName") \
        docker compose -f "$dcPath/docker-compose.${exampleName}.yml" up --build --detach
    exit 1

}

function stopExample() {
    docker ps --filter name="^norsk-source" --filter name="^norsk-example" --filter name="norsk-server" -q | xargs --no-run-if-empty docker rm -f
    docker network ls --filter name="^norsk-nw" -q | xargs --no-run-if-empty docker network rm
}

function main() {
    local -r opts=$(getopt -o h: --longoptions help,license-file:,log-root: -n "$0" -- "$@")

    local dcPath

    # Defaults
    dcPath="docker-compose/host-networking"
    LOG_ROOT="norskLogs"

    eval set -- "$opts"
    while true; do
        case "$1" in
        -h | --help)
            usage
            ;;
        --license-file)
            export LICENSE_FILE="$2"
            shift 2
            ;;
        --log-root)
            # Remove trailing slash if present
            export LOG_ROOT=${2%/}
            shift 2
            ;;
        --network-mode)
            case "$2" in
            docker)
                dcPath="docker-compose/docker-networking"
                ;;
            host)
                ## Set in the default
                ;;
            *)
                echo "Unknown network-mode $2"
                exit 1
                ;;
            esac
            networkMode="$2"
            shift 2
            ;;
        --)
            shift
            break
            ;;
        *)
            break
            ;;
        esac
    done
    if [[ -z ${LICENSE_FILE+x} ]]; then
        usage
    fi

    if [[ ! -f ${LICENSE_FILE} ]]; then
        echo "License file not found: ${LICENSE_FILE}"
        exit 1
    fi

    checkDockerCompose

    if [[ $# -eq 1 ]]; then
        case "$1" in
        list)
            listExamples
            exit 0
            ;;
        stop)
            stopExample
            exit 0
            ;;
        *)
            echo "Error: Unknown command $1"
            usage
            ;;
        esac
    fi

if [[ $# -eq 2 ]]; then
        case "$1" in
        run)
            runExample "$2" ${dcPath}
            ;;
        stop)
            stopExample
            ;;
        *)
            echo "Error: Unknown command $1"
            usage
            ;;
        esac
    fi


}

main "$@"
